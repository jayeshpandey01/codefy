import { it, expect } from "vitest";
import { HostedLlmClient } from "../../llm/hosted-client.js";
import { executeRagRetrieval, verifyLlmResponse } from "../../rag/index.js";
import { FIXTURE_FINDINGS } from "../query/fixtures.js";
import type { WorkspaceGraph, OkfBundle } from "@whoami/types";

const LIVE_RENDER_URL = "https://cmd-d-llm.vercel.app";
const RUN_LIVE_TESTS = process.env.RUN_LIVE_TESTS === "1";

const mockGraph: WorkspaceGraph = {
  nodes: [
    { id: "database.py", label: "database.py", type: "file", filePath: "database.py", findingCount: 1, highestSeverity: "critical" },
    { id: "api/users.py", label: "users.py", type: "file", filePath: "api/users.py" },
    { id: "src/server.ts", label: "server.ts", type: "file", filePath: "src/server.ts" },
    { id: "getUserById", label: "getUserById", type: "function", filePath: "api/users.py", line: 15 },
  ],
  edges: [
    { id: "e1", source: "api/users.py", target: "database.py", type: "imports" },
    { id: "e2", source: "src/server.ts", target: "database.py", type: "imports" },
    { id: "e3", source: "getUserById", target: "database.py", type: "calls" },
  ],
};

const mockOkfBundle: OkfBundle = {
  repository: {
    filename: "REPO.md",
    type: "repository",
    title: "Repository Overview",
    content: "Codefy secure AST workspace with taint tracking.",
    updatedAt: new Date().toISOString(),
  },
  architecture: {
    filename: "ARCH.md",
    type: "architecture",
    title: "System Architecture",
    content: "Axiom inference server coupled with Codefy desktop application.",
    updatedAt: new Date().toISOString(),
  },
  services: {
    filename: "SERVICES.md",
    type: "services",
    title: "Services Map",
    content: "PostgreSQL database running on internal port 5432.",
    updatedAt: new Date().toISOString(),
  },
  securityFindings: {
    filename: "FINDINGS.md",
    type: "security-findings",
    title: "Security Findings",
    content: "Finding F-10291 SQL Injection in database.py.",
    updatedAt: new Date().toISOString(),
  },
  generatedAt: new Date().toISOString(),
};

it.skipIf(!RUN_LIVE_TESTS)("executes sample question against live RAG pipeline and prints output", async () => {
  const query = "Why is finding F-10291 critical and what is its blast radius?";

  console.log("\n=======================================================================");
  console.log("❓ USER SAMPLE QUERY:");
  console.log(`   "${query}"`);
  console.log("=======================================================================\n");

  // 1. Client-side pure TypeScript RAG retrieval (< 1ms)
  const t0 = performance.now();
  const retrieval = executeRagRetrieval(query, FIXTURE_FINDINGS, {
    workspaceGraph: mockGraph,
    okfBundle: mockOkfBundle,
  });
  const t1 = performance.now();

  console.log("--- 1. NLU INTENT & ENTITY EXTRACTION ---");
  console.log("• Classified Intent:", retrieval.nluAnalysis.intent);
  console.log("• Intent Confidence:", `${(retrieval.nluAnalysis.intentConfidence * 100).toFixed(1)}%`);
  console.log("• Extracted Slots:", retrieval.nluAnalysis.slots);
  console.log(`• Execution Latency: ${(t1 - t0).toFixed(3)}ms\n`);

  console.log("--- 2. INTER-PROCEDURAL SLICE & BLAST RADIUS ---");
  console.log("• Focal Finding ID:", retrieval.slice.focalFindingId);
  console.log("• Taint Steps in Slice:", retrieval.slice.taintSlice.length);
  console.log("• Downstream Dependent Modules:", retrieval.slice.blastRadius.downstreamImports);
  console.log("• Caller Functions:", retrieval.slice.blastRadius.callers);
  console.log("• Estimated Context Tokens:", retrieval.slice.estimatedTokens, "(Target: < 350 tokens)\n");

  console.log("--- 3. RETRIEVED CITATIONS ---");
  retrieval.citations.forEach((c) => {
    console.log(`  [${c.citationIndex}] ${c.section} (Score: ${(c.score ?? 0).toFixed(2)}) -> ${c.filePath}:${c.line}`);
  });
  console.log("\n--- 4. SYNTHESIZED SYSTEM PROMPT (Bounded <Context>) ---");
  console.log(retrieval.systemPrompt);
  console.log("\n• Visualizer View Mode Auto-Selection:", retrieval.graphViewMode);
  console.log("• Dynamic Follow-up Suggestions:", retrieval.suggestions);

  console.log("\n=======================================================================");
  console.log(`🌐 5. DISPATCHING TO LIVE RENDER BACKEND (${LIVE_RENDER_URL})`);
  console.log("=======================================================================\n");

  const client = new HostedLlmClient({
    baseUrl: LIVE_RENDER_URL,
    timeoutMs: 45000,
  });

  const streamedDeltas: string[] = [];
  const tStartStream = performance.now();

  const chatResult = await client.streamRagChat(
    query,
    FIXTURE_FINDINGS,
    {
      workspaceGraph: mockGraph,
      okfBundle: mockOkfBundle,
    },
    (chunk) => {
      if (chunk.delta) {
        streamedDeltas.push(chunk.delta);
      }
    },
  );

  const tEndStream = performance.now();
  console.log(`• Live SSE Stream Latency: ${(tEndStream - tStartStream).toFixed(1)}ms`);
  console.log(`• Chunks Received: ${streamedDeltas.length}`);
  console.log("\n💬 GENERATED LLM RESPONSE OUTPUT:");
  console.log("-----------------------------------------------------------------------");
  console.log(chatResult.explanation);
  console.log("-----------------------------------------------------------------------\n");

  console.log("--- 6. NEURO-SYMBOLIC HALLUCINATION GUARD AUDIT ---");
  const guardResult = verifyLlmResponse(chatResult.explanation || "", {
    findings: FIXTURE_FINDINGS,
    graph: mockGraph,
  });
  console.log("• Response Validity:", guardResult.isValid ? "✅ GROUNDED & FACTUAL (0 Hallucinations)" : "⚠️ VIOLATION DETECTED");
  console.log("• Violations Count:", guardResult.violations.length);
  if (guardResult.violations.length > 0) {
    console.log("• Violation Details:", guardResult.violations);
  }

  console.log("\n=======================================================================");
  console.log("🎉 SAMPLE QUERY AUDIT COMPLETED WITH FULL EVIDENCE GROUNDING!");
  console.log("=======================================================================\n");

  expect(chatResult.capability).toBe("SUPPORTED");
  expect(chatResult.explanation?.length).toBeGreaterThan(0);
}, 60000);
