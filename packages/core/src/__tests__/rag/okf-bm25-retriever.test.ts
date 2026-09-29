import { describe, it, expect } from "vitest";
import type { Finding, OkfBundle, WorkspaceGraph } from "@whoami/types";
import { buildOkfBm25Index } from "../../rag/okf-bm25-retriever.js";
import { analyzeQuery } from "../../rag/nlu-analyzer.js";

describe("OkfBm25Retriever", () => {
  const mockFindings: Finding[] = [
    {
      id: "F-10291",
      ruleId: "ts/sql-injection",
      status: "confirmed",
      severity: "critical",
      title: "Raw SQL query with string concatenation",
      description: "User input directly interpolated into SQL query via db.query",
      cwe: "CWE-89",
      createdAt: new Date().toISOString(),
      trace: {
        sinkClass: "sql-injection",
        steps: [
          { role: "source", label: "req.params.id", filePath: "src/api/user.ts", line: 42 },
          { role: "sink", label: "db.query()", filePath: "src/api/user.ts", line: 45 },
        ],
      },
      fix: "const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);",
    },
    {
      id: "F-99999",
      ruleId: "ts/xss",
      status: "confirmed",
      severity: "medium",
      title: "Cross-site scripting in render",
      description: "dangerouslySetInnerHTML used with unescaped comment body",
      cwe: "CWE-79",
      createdAt: new Date().toISOString(),
      trace: {
        sinkClass: "prototype-pollution",
        steps: [
          { role: "source", label: "props.comment", filePath: "src/components/Comment.tsx", line: 12 },
          { role: "sink", label: "dangerouslySetInnerHTML", filePath: "src/components/Comment.tsx", line: 18 },
        ],
      },
    },
  ];

  const mockOkfBundle: OkfBundle = {
    repository: {
      filename: "REPOSITORY.md",
      type: "repository",
      title: "Repository Overview",
      content: "Codefy core engine with TypeScript AST parsing and taint tracking.",
      updatedAt: new Date().toISOString(),
    },
    architecture: {
      filename: "ARCHITECTURE.md",
      type: "architecture",
      title: "System Architecture",
      content: "Microservices consisting of Axiom inference server, Tauri desktop frontend, and Core engine.",
      updatedAt: new Date().toISOString(),
    },
    services: {
      filename: "SERVICES.md",
      type: "services",
      title: "External Services",
      content: "PostgreSQL database connected via pg pool at src/db.ts.",
      updatedAt: new Date().toISOString(),
    },
    securityFindings: {
      filename: "SECURITY_FINDINGS.md",
      type: "security-findings",
      title: "Security Findings Summary",
      content: "1 critical SQL injection finding F-10291 in src/api/user.ts.",
      updatedAt: new Date().toISOString(),
    },
    generatedAt: new Date().toISOString(),
  };

  it("prioritizes exact Finding ID with 5.0x boost", () => {
    const index = buildOkfBm25Index(mockFindings, undefined, mockOkfBundle);
    const nlu = analyzeQuery("Tell me about finding F-10291");
    const results = index.search(nlu, 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunk.findingId).toBe("F-10291");
    expect(results[0]?.score).toBeGreaterThan(5.0);
  });

  it("retrieves architecture OKF chunk when querying system architecture", () => {
    const index = buildOkfBm25Index(mockFindings, undefined, mockOkfBundle);
    const nlu = analyzeQuery("What microservices and system architecture do we have?");
    const results = index.search(nlu, 3);

    expect(results.length).toBeGreaterThan(0);
    const archChunk = results.find((r) => r.chunk.type === "architecture");
    expect(archChunk).toBeDefined();
    expect(archChunk?.chunk.content).toContain("Axiom inference server");
  });

  it("prioritizes file path matches when file name is queried", () => {
    const index = buildOkfBm25Index(mockFindings, undefined, mockOkfBundle);
    const nlu = analyzeQuery("Are there any issues in user.ts?");
    const results = index.search(nlu, 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.chunk.filePath).toBe("src/api/user.ts");
  });

  it("executes search in under 5 milliseconds", () => {
    const index = buildOkfBm25Index(mockFindings, undefined, mockOkfBundle);
    const nlu = analyzeQuery("SQL injection database query vulnerability");

    // Warm up JIT
    for (let i = 0; i < 5; i++) {
      index.search(nlu, 5);
    }

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      index.search(nlu, 5);
    }
    const elapsed = (performance.now() - start) / 50;

    expect(elapsed).toBeLessThan(5.0); // Under 5ms as per test spec
  });
});
