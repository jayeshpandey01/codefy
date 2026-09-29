import { describe, it, expect } from "vitest";
import type { Finding, WorkspaceGraph } from "@whoami/types";
import { buildProgramSlice } from "../../rag/program-slicer.js";

describe("ProgramSlicer", () => {
  const mockFinding: Finding = {
    id: "F-10291",
    ruleId: "ts/command-injection",
    status: "confirmed",
    severity: "critical",
    title: "Command Injection in exec",
    description: "User input reaches child_process.exec without validation",
    cwe: "CWE-78",
    createdAt: new Date().toISOString(),
    trace: {
      sinkClass: "command-injection",
      steps: [
        { role: "source", label: "req.body.filename", filePath: "src/api/convert.ts", line: 15 },
        { role: "sanitizer", label: "path.basename(filename)", filePath: "src/api/convert.ts", line: 18 },
        { role: "sink", label: "exec(`convert ${filename}`)", filePath: "src/api/convert.ts", line: 24 },
      ],
    },
    fix: "execFile('convert', [sanitizedFilename], callback);",
  };

  const mockGraph: WorkspaceGraph = {
    nodes: [
      { id: "src/api/convert.ts", label: "convert.ts", type: "file", filePath: "src/api/convert.ts" },
      { id: "src/routes/api.ts", label: "api.ts", type: "file", filePath: "src/routes/api.ts" },
      { id: "src/server.ts", label: "server.ts", type: "file", filePath: "src/server.ts" },
    ],
    edges: [
      { id: "e1", source: "src/routes/api.ts", target: "src/api/convert.ts", type: "imports" },
      { id: "e2", source: "src/server.ts", target: "src/routes/api.ts", type: "imports" },
      { id: "e3", source: "handleConvertRequest", target: "src/api/convert.ts", type: "calls" },
    ],
  };

  it("extracts inter-procedural taint flow trajectory", () => {
    const slice = buildProgramSlice([mockFinding], mockGraph, "src/api/convert.ts");

    expect(slice.focalFindingId).toBe("F-10291");
    expect(slice.taintSlice.length).toBe(3);
    expect(slice.taintSlice[0]?.role).toBe("SOURCE");
    expect(slice.taintSlice[1]?.role).toBe("SANITIZER");
    expect(slice.taintSlice[2]?.role).toBe("SINK");
    expect(slice.sliceMarkdown).toContain("`req.body.filename`");
    expect(slice.sliceMarkdown).toContain("execFile('convert'");
  });

  it("extracts 1-hop blast radius downstream imports and callers", () => {
    const slice = buildProgramSlice([mockFinding], mockGraph, "src/api/convert.ts");

    expect(slice.blastRadius.downstreamImports).toContain("src/routes/api.ts");
    expect(slice.blastRadius.callers).toContain("handleConvertRequest");
    expect(slice.sliceMarkdown).toContain("src/routes/api.ts");
    expect(slice.sliceMarkdown).toContain("handleConvertRequest");
  });

  it("guarantees token reduction to strictly under 350 tokens", () => {
    const slice = buildProgramSlice([mockFinding], mockGraph, "src/api/convert.ts");

    // Standard raw file context would be 1,500 - 6,000 tokens
    expect(slice.estimatedTokens).toBeLessThan(350);
    expect(slice.estimatedTokens).toBeGreaterThan(20);
  });
});
