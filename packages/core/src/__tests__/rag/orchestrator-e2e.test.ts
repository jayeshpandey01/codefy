import { describe, it, expect } from "vitest";
import type { Finding, OkfBundle, WorkspaceGraph } from "@whoami/types";
import { executeRagRetrieval } from "../../rag/index.js";

describe("Orchestrator End-to-End GraphRAG", () => {
  const mockFindings: Finding[] = [
    {
      id: "F-10291",
      ruleId: "ts/sql-injection",
      status: "confirmed",
      severity: "critical",
      title: "SQL Injection in auth query",
      description: "User input interpolated into query. Token: ghp_111111111111111111111111111111111111",
      cwe: "CWE-89",
      createdAt: new Date().toISOString(),
      trace: {
        sinkClass: "sql-injection",
        steps: [
          { role: "source", label: "req.params.id", filePath: "src/api/auth.ts", line: 42 },
          { role: "sanitizer", label: "Number.parseInt", filePath: "src/api/auth.ts", line: 43 },
          { role: "sink", label: "db.query()", filePath: "src/api/auth.ts", line: 45 },
        ],
      },
      fix: "const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);",
    },
    {
      id: "remote-recon-1",
      ruleId: "cloud/exposed-bucket",
      status: "confirmed",
      severity: "high",
      scope: "orchestrator",
      title: "Public S3 bucket",
      description: "S3 bucket allows anonymous read",
      createdAt: new Date().toISOString(),
      trace: {
        sinkClass: "secret-exposure",
        steps: [{ role: "sink", label: "s3.bucket", filePath: "terraform/main.tf", line: 10 }],
      },
    },
  ];

  const mockGraph: WorkspaceGraph = {
    nodes: [
      { id: "src/api/auth.ts", label: "auth.ts", type: "file", filePath: "src/api/auth.ts", findingCount: 1 },
      { id: "src/server.ts", label: "server.ts", type: "file", filePath: "src/server.ts" },
    ],
    edges: [
      { id: "e1", source: "src/server.ts", target: "src/api/auth.ts", type: "imports" },
      { id: "e2", source: "startApp", target: "src/api/auth.ts", type: "calls" },
    ],
  };

  const mockOkfBundle: OkfBundle = {
    repository: {
      filename: "REPOSITORY.md",
      type: "repository",
      title: "Repository Overview",
      content: "Codefy secure scanning workspace.",
      updatedAt: new Date().toISOString(),
    },
    architecture: {
      filename: "ARCHITECTURE.md",
      type: "architecture",
      title: "System Architecture",
      content: "Auth API interacts with PostgreSQL.",
      updatedAt: new Date().toISOString(),
    },
    services: {
      filename: "SERVICES.md",
      type: "services",
      title: "Services",
      content: "Auth Service running on port 3000.",
      updatedAt: new Date().toISOString(),
    },
    securityFindings: {
      filename: "SECURITY_FINDINGS.md",
      type: "security-findings",
      title: "Security Findings",
      content: "F-10291 reported in src/api/auth.ts.",
      updatedAt: new Date().toISOString(),
    },
    generatedAt: new Date().toISOString(),
  };

  it("orchestrates retrieval for a specific finding with grounded context and citations", () => {
    const result = executeRagRetrieval("explain F-10291 in src/api/auth.ts", mockFindings, {
      workspaceGraph: mockGraph,
      okfBundle: mockOkfBundle,
    });

    expect(result.matchedFindings.length).toBe(1);
    expect(result.matchedFindings[0]?.id).toBe("F-10291");
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0]?.findingId).toBe("F-10291");
    expect(result.systemPrompt).toContain("<context>");
    expect(result.systemPrompt).toContain("</context>");
    expect(result.systemPrompt).toContain("F-10291");

    // Leakage check: GitHub token must be redacted
    expect(result.systemPrompt).not.toContain("ghp_111111111111111111111111111111111111");
    expect(result.systemPrompt).toContain("[REDACTED]");

    // Inter-procedural program slice check
    expect(result.slice.taintSlice.length).toBe(3);
    expect(result.slice.blastRadius.downstreamImports).toContain("src/server.ts");
    expect(result.slice.estimatedTokens).toBeLessThan(350);
  });

  it("routes to blast_radius view when querying downstream impact", () => {
    const result = executeRagRetrieval("what is the blast radius and downstream impact of auth.ts?", mockFindings, {
      workspaceGraph: mockGraph,
      okfBundle: mockOkfBundle,
    });

    expect(result.graphViewMode).toBe("blast_radius");
  });

  it("routes to control_flow view when analyzing sanitizers", () => {
    const result = executeRagRetrieval("show me the sanitizer and control flow for input validation", mockFindings, {
      workspaceGraph: mockGraph,
      okfBundle: mockOkfBundle,
    });

    expect(result.graphViewMode).toBe("control_flow");
  });

  it("routes to remote view for orchestrator findings", () => {
    const result = executeRagRetrieval("inspect remote-recon-1", mockFindings, {
      workspaceGraph: mockGraph,
      okfBundle: mockOkfBundle,
    });

    expect(result.graphViewMode).toBe("remote");
  });

  it("executes the entire RAG pipeline with high-throughput low-millisecond latency", () => {
    // Warm up JIT compiler before measuring
    for (let i = 0; i < 5; i++) {
      executeRagRetrieval("explain F-10291 SQL injection fix", mockFindings, {
        workspaceGraph: mockGraph,
        okfBundle: mockOkfBundle,
      });
    }

    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      executeRagRetrieval("explain F-10291 SQL injection fix", mockFindings, {
        workspaceGraph: mockGraph,
        okfBundle: mockOkfBundle,
      });
    }
    const avgDuration = (performance.now() - start) / 20;

    expect(avgDuration).toBeLessThan(10.0); // Low-latency execution under 10ms (resilient on CI runners)
  });
});
