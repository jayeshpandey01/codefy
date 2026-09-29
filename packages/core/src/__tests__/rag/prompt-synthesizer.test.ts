import { describe, it, expect } from "vitest";
import { synthesizePrompt, BASE_SECURITY_SYSTEM_PROMPT } from "../../rag/prompt-synthesizer.js";
import type { ScoredOkfChunk } from "../../rag/okf-bm25-retriever.js";
import type { ProgramSlice } from "../../rag/program-slicer.js";

describe("PromptSynthesizer", () => {
  const mockChunks: ScoredOkfChunk[] = [
    {
      chunk: {
        id: "chunk-1",
        type: "finding",
        title: "Finding F-10291 — SQL Injection",
        content: "User input interpolated into query string. Database credentials: AKIAIOSFODNN7EXAMPLE",
        filePath: "src/api/auth.ts",
        line: 42,
        findingId: "F-10291",
        tokenFreqs: new Map(),
        length: 20,
        staticBoost: 1.5,
      },
      score: 12.5,
    },
  ];

  const mockSlice: ProgramSlice = {
    focalFindingId: "F-10291",
    focalFilePath: "src/api/auth.ts",
    taintSlice: [
      { role: "SOURCE", label: "req.body.id", location: "src/api/auth.ts:40" },
      { role: "SINK", label: "db.query()", location: "src/api/auth.ts:42" },
    ],
    blastRadius: {
      downstreamImports: ["src/server.ts"],
      callers: ["handleLogin"],
    },
    suggestedFix: "db.query('...', [id])",
    sliceMarkdown: "#### Inter-Procedural Taint Path:\n[SOURCE] req.body.id -> [SINK] db.query",
    estimatedTokens: 45,
  };

  it("enforces a concise base system prompt under 120 words", () => {
    const wordCount = BASE_SECURITY_SYSTEM_PROMPT.trim().split(/\s+/).length;
    expect(wordCount).toBeLessThan(120);
    expect(BASE_SECURITY_SYSTEM_PROMPT).toContain("RULES:");
    expect(BASE_SECURITY_SYSTEM_PROMPT).toContain("GROUNDING:");
    expect(BASE_SECURITY_SYSTEM_PROMPT).toContain("CITATIONS:");
  });

  it("produces structured citations and <context> blocks", () => {
    const result = synthesizePrompt("explain F-10291", mockChunks, mockSlice);

    expect(result.citations.length).toBe(1);
    expect(result.citations[0]?.citationIndex).toBe(1);
    expect(result.citations[0]?.findingId).toBe("F-10291");
    expect(result.referencedFindingIds).toContain("F-10291");
    expect(result.systemPrompt).toContain("<context>");
    expect(result.systemPrompt).toContain("</context>");
    expect(result.systemPrompt).toContain("[1] Finding F-10291");
  });

  it("redacts credentials from chunk content to prevent data leakage", () => {
    const result = synthesizePrompt("explain F-10291", mockChunks, mockSlice);

    // The AWS key in mockChunks must be redacted
    expect(result.systemPrompt).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.systemPrompt).toContain("[REDACTED]");
  });
});
