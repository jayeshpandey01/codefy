import { describe, expect, it } from "vitest";
import type { WorkspaceGraph } from "@whoami/types";
import { generateOkfBundle } from "../../okf/generator.js";
import { FIXTURE_FINDINGS } from "../query/fixtures.js";

describe("generateOkfBundle", () => {
  const mockGraph: WorkspaceGraph = {
    nodes: [
      { id: "dir-1", label: "src", type: "directory", filePath: "src" },
      {
        id: "file-1",
        label: "database.py",
        type: "file",
        filePath: "database.py",
        findingCount: 1,
        highestSeverity: "critical",
      },
      {
        id: "file-2",
        label: "fetcher.ts",
        type: "file",
        filePath: "src/fetcher.ts",
        findingCount: 1,
        highestSeverity: "medium",
      },
      {
        id: "func-1",
        label: "queryUsers",
        type: "function",
        filePath: "database.py",
        line: 80,
      },
      {
        id: "class-1",
        label: "DatabaseService",
        type: "class",
        filePath: "database.py",
        line: 10,
      },
    ],
    edges: [
      {
        id: "e1",
        source: "src/fetcher.ts",
        target: "database.py",
        type: "imports",
      },
      {
        id: "e2",
        source: "fetcher.ts",
        target: "queryUsers",
        type: "calls",
      },
    ],
  };

  it("generates a complete OkfBundle with all 4 core documents", () => {
    const bundle = generateOkfBundle(FIXTURE_FINDINGS, mockGraph, "/workspace/my-app");

    expect(bundle.repository).toBeDefined();
    expect(bundle.architecture).toBeDefined();
    expect(bundle.securityFindings).toBeDefined();
    expect(bundle.services).toBeDefined();
    expect(bundle.workspacePath).toBe("/workspace/my-app");

    // Repository doc checks
    expect(bundle.repository.filename).toBe("repository.md");
    expect(bundle.repository.content).toContain("**Total Security Findings:** 4");
    expect(bundle.repository.content).toContain("**Critical:** 1");

    // Architecture doc checks
    expect(bundle.architecture.filename).toBe("architecture.md");
    expect(bundle.architecture.content).toContain("database.py");
    expect(bundle.architecture.content).toContain("CRITICAL");
    expect(bundle.architecture.content).toContain("**Total Cross-Module Imports:** 1");

    // Security findings doc checks
    expect(bundle.securityFindings.filename).toBe("security-findings.md");
    expect(bundle.securityFindings.content).toContain("F-10291");
    expect(bundle.securityFindings.content).toContain("SQL Injection");
    expect(bundle.securityFindings.content).toContain("CWE-89");
    expect(bundle.securityFindings.content).toContain("[SOURCE]");
    expect(bundle.securityFindings.content).toContain("[SINK]");

    // Services doc checks
    expect(bundle.services.filename).toBe("services.md");
    expect(bundle.services.content).toContain("DatabaseService");
    expect(bundle.services.content).toContain("queryUsers()");
  });

  it("handles empty findings and undefined graph safely", () => {
    const bundle = generateOkfBundle([], undefined);
    expect(bundle.securityFindings.content).toContain("No security vulnerabilities detected");
    expect(bundle.repository.content).toContain("**Total Security Findings:** 0");
    expect(bundle.services.content).toContain("No classes detected");
  });

});
