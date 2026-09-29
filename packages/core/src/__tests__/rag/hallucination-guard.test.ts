import { describe, it, expect } from "vitest";
import type { Finding, WorkspaceGraph } from "@whoami/types";
import { verifyLlmResponse } from "../../rag/hallucination-guard.js";

describe("HallucinationGuard: Neuro-Symbolic Post-Generation Verification", () => {
  const mockFindings: Finding[] = [
    {
      id: "F-10291",
      ruleId: "ts/sql-injection",
      status: "confirmed",
      severity: "critical",
      title: "SQL injection in auth",
      description: "SQL injection via req.params.id",
      createdAt: new Date().toISOString(),
      trace: {
        sinkClass: "sql-injection",
        steps: [
          { role: "source", label: "req.params.id", filePath: "src/api/auth.ts", line: 42 },
          { role: "sink", label: "db.query()", filePath: "src/api/auth.ts", line: 45 },
        ],
      },
    },
  ];

  const mockGraph: WorkspaceGraph = {
    nodes: [
      { id: "src/api/auth.ts", label: "auth.ts", type: "file", filePath: "src/api/auth.ts" },
      { id: "src/server.ts", label: "server.ts", type: "file", filePath: "src/server.ts" },
    ],
    edges: [
      { id: "e1", source: "src/server.ts", target: "src/api/auth.ts", type: "imports" },
    ],
  };

  it("passes completely for a factual, grounded response", () => {
    const response = `Finding F-10291 is a critical vulnerability located in src/api/auth.ts at line 45.
\`\`\`typescript
const res = await db.query("SELECT * FROM users WHERE id = $1", [id]);
\`\`\``;

    const result = verifyLlmResponse(response, {
      findings: mockFindings,
      graph: mockGraph,
    });

    expect(result.isValid).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it("detects and flags hallucinated finding IDs", () => {
    const response = "We also detected F-88888 which represents a critical zero-day exploit.";

    const result = verifyLlmResponse(response, {
      findings: mockFindings,
      graph: mockGraph,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        type: "HALLUCINATED_FINDING",
        entity: "F-88888",
      }),
    );
  });

  it("detects and flags hallucinated non-existent files", () => {
    const response = "The vulnerable component is defined in src/crypto/phantom_wallet.ts.";

    const result = verifyLlmResponse(response, {
      findings: mockFindings,
      graph: mockGraph,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        type: "HALLUCINATED_FILE",
        entity: "src/crypto/phantom_wallet.ts",
      }),
    );
  });

  it("detects syntax errors / unbalanced delimiters in code snippets", () => {
    const response = `Here is your fix:
\`\`\`typescript
function fix() {
  if (true) {
    db.query();
  // missing closing brackets
\`\`\``;

    const result = verifyLlmResponse(response, {
      findings: mockFindings,
      graph: mockGraph,
    });

    expect(result.isValid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        type: "SYNTAX_ERROR",
      }),
    );
  });

  it("redacts credentials from LLM response text", () => {
    const response = "Use this API key: AKIAIOSFODNN7EXAMPLE to test the fix.";

    const result = verifyLlmResponse(response, {
      findings: mockFindings,
      graph: mockGraph,
    });

    expect(result.sanitizedText).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.sanitizedText).toContain("[REDACTED]");
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        type: "SECRET_LEAKAGE",
      }),
    );
  });
});
