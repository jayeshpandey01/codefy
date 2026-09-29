import { describe, it, expect } from "vitest";
import {
  tokenizeText,
  splitCamelCase,
  splitCompound,
  extractSlots,
  classifyIntent,
  analyzeQuery,
} from "../../rag/nlu-analyzer.js";

describe("NluAnalyzer: Morphological Tokenization", () => {
  it("splits camelCase into constituent words and compound representation", () => {
    const parts = splitCamelCase("getUserById");
    expect(parts).toContain("get");
    expect(parts).toContain("user");
    expect(parts).toContain("id");
    expect(parts).toContain("getuserbyid");
  });

  it("splits snake_case and kebab-case into tokens", () => {
    const parts = splitCompound("db_query_raw-handler");
    expect(parts).toContain("db");
    expect(parts).toContain("query");
    expect(parts).toContain("raw");
    expect(parts).toContain("handler");
  });

  it("filters stop words while preserving core security primitives", () => {
    const tokens = tokenizeText("what is the blast radius and taint flow for the sink in database?");
    expect(tokens).toContain("blast");
    expect(tokens).toContain("radius");
    expect(tokens).toContain("taint");
    expect(tokens).toContain("flow");
    expect(tokens).toContain("sink");
    expect(tokens).toContain("database");
    expect(tokens).not.toContain("what");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("for");
  });
});

describe("NluAnalyzer: Deterministic Slot Filling", () => {
  it("extracts finding IDs, CWE identifiers, and file paths accurately", () => {
    const text = "Can you inspect F-10291 (CWE-89) in src/auth/login.ts with critical severity?";
    const slots = extractSlots(text);

    expect(slots.findingIds).toEqual(["F-10291"]);
    expect(slots.cweIds).toEqual(["CWE-89"]);
    expect(slots.filePaths).toEqual(["src/auth/login.ts"]);
    expect(slots.targetSeverity).toBe("critical");
  });

  it("extracts canonical sink classes", () => {
    const text = "Does this input cause command-injection or sql injection?";
    const slots = extractSlots(text);
    expect(slots.sinkClasses).toContain("command-injection");
    expect(slots.sinkClasses).toContain("sql-injection");
  });
});

describe("NluAnalyzer: Statistical Intent Classifier", () => {
  it("classifies vulnerability explanation intent", () => {
    const nlu = analyzeQuery("Explain why this SQL injection vulnerability is dangerous in F-10291");
    expect(nlu.intent).toBe("EXPLAIN_VULNERABILITY");
    expect(nlu.intentConfidence).toBeGreaterThan(0.3);
  });

  it("classifies remediation diff intent", () => {
    const nlu = analyzeQuery("How do I fix this flaw? Provide a patch and code remediation diff");
    expect(nlu.intent).toBe("REMEDIATE_DIFF");
    expect(nlu.intentConfidence).toBeGreaterThan(0.3);
  });

  it("classifies blast radius analysis intent", () => {
    const nlu = analyzeQuery("What is the blast radius and which files are affected downstream?");
    expect(nlu.intent).toBe("BLAST_RADIUS_ANALYSIS");
    expect(nlu.intentConfidence).toBeGreaterThan(0.3);
  });

  it("classifies taint flow trace intent", () => {
    const nlu = analyzeQuery("Trace the untrusted input dataflow from source to sink");
    expect(nlu.intent).toBe("TAINT_FLOW_TRACE");
    expect(nlu.intentConfidence).toBeGreaterThan(0.3);
  });

  it("classifies architecture overview intent", () => {
    const nlu = analyzeQuery("Give me a high level overview of the repository architecture and services");
    expect(nlu.intent).toBe("ARCHITECTURE_OVERVIEW");
    expect(nlu.intentConfidence).toBeGreaterThan(0.3);
  });

  it("classifies hallucination verification intent", () => {
    const nlu = analyzeQuery("Is this finding real or a hallucination? Please verify and confirm");
    expect(nlu.intent).toBe("VERIFY_HALLUCINATION");
    expect(nlu.intentConfidence).toBeGreaterThan(0.3);
  });

  it("classifies general developer questions as GENERAL_ASSISTANCE and unbinds active finding", () => {
    const nlu = analyzeQuery("explain me python developer", "F-SECRET-123");
    expect(nlu.intent).toBe("GENERAL_ASSISTANCE");
    expect(nlu.slots.findingIds).toHaveLength(0);
    expect(nlu.isAnaphoric).toBe(false);
    expect(nlu.boundFindingId).toBeUndefined();
  });

  it("classifies file navigation requests as CODE_NAVIGATION with extracted file slot", () => {
    const nlu = analyzeQuery("can you redirect to the agent.py file");
    expect(nlu.intent).toBe("CODE_NAVIGATION");
    expect(nlu.slots.filePaths).toContain("agent.py");
  });

  it("resolves anaphora against active finding when deictic referent is present", () => {
    const nlu = analyzeQuery("why is this confirmed?", "F-10291");
    expect(nlu.isAnaphoric).toBe(true);
    expect(nlu.boundFindingId).toBe("F-10291");
  });
});

