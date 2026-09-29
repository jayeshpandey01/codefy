import { describe, expect, it } from "vitest";
import type { Finding, WorkspaceGraph } from "@whoami/types";
import {
  findingsToInterconnectedGraph,
  buildUnifiedInterconnectedGraph,
  buildBlastRadiusGraph,
  buildControlFlowGraph,
  buildSupplyChainGraph,
  buildRemoteAttackSurfaceGraph,
  isTestFilePath,
  filterWorkspaceGraphTestFiles,
} from "../visualization/graph-transformers.js";

const FIXTURE_FINDINGS: Finding[] = [
  {
    id: "f1",
    ruleId: "sql-injection",
    status: "confirmed",
    severity: "critical",
    title: "SQL Injection via req.query.id",
    description: "id reaches db.query",
    cwe: "CWE-89",
    createdAt: "2026-09-01T00:00:00Z",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        {
          role: "source",
          label: "req.query.id",
          filePath: "src/api.ts",
          line: 10,
        },
        {
          role: "sanitizer",
          label: "validateId(id)",
          filePath: "src/validate.ts",
          line: 15,
        },
        {
          role: "passthrough",
          label: "fetchData(id)",
          filePath: "src/service.ts",
          line: 25,
        },
        {
          role: "sink",
          label: "db.query(sql)",
          filePath: "src/db.ts",
          line: 50,
        },
      ],
    },
  },
  {
    id: "f2",
    ruleId: "command-injection",
    status: "confirmed",
    severity: "high",
    title: "Command Injection via req.query.id",
    description: "same id reaches exec",
    cwe: "CWE-78",
    createdAt: "2026-09-01T00:00:00Z",
    trace: {
      sinkClass: "command-injection",
      steps: [
        {
          // SAME SOURCE AS F1
          role: "source",
          label: "req.query.id",
          filePath: "src/api.ts",
          line: 10,
        },
        {
          role: "sink",
          label: "exec(cmd)",
          filePath: "src/cmd.ts",
          line: 80,
        },
      ],
    },
  },
];

const FIXTURE_REMOTE_FINDINGS: Finding[] = [
  {
    id: "remote-job1-1",
    ruleId: "remote-sqli",
    status: "confirmed",
    severity: "critical",
    title: "SQL Injection in /api/v1/users",
    description: "Union based SQLi detected",
    scope: "endpoint",
    createdAt: "2026-09-01T00:00:00Z",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        {
          role: "source",
          label: "Target Scope: scanme.nmap.org",
          filePath: "https://scanme.nmap.org/api/v1/users",
          line: 1,
        },
        {
          role: "sanitizer",
          label: "Scanner Probe: sqlmap test",
          filePath: "https://scanme.nmap.org/api/v1/users",
          line: 1,
        },
        {
          role: "sink",
          label: "Vulnerable Endpoint: https://scanme.nmap.org/api/v1/users",
          filePath: "https://scanme.nmap.org/api/v1/users",
          line: 1,
        },
      ],
    },
  },
  {
    id: "remote-job1-2",
    ruleId: "remote-open-port",
    status: "confirmed",
    severity: "low",
    title: "Open Port: 80/tcp",
    description: "HTTP service active",
    scope: "endpoint",
    createdAt: "2026-09-01T00:00:00Z",
    trace: {
      sinkClass: "ssrf",
      steps: [
        {
          role: "source",
          label: "Target Scope: scanme.nmap.org",
          filePath: "scanme.nmap.org:80",
          line: 1,
        },
        {
          role: "sink",
          label: "Discovered Port: 80",
          filePath: "scanme.nmap.org:80",
          line: 1,
        },
      ],
    },
  },
];

describe("findingsToInterconnectedGraph", () => {
  it("deduplicates identical source and sink nodes across multiple findings into an interconnected DAG", () => {
    const result = findingsToInterconnectedGraph(FIXTURE_FINDINGS, {
      groupByFile: false,
    });

    // 1 shared source, 1 sanitizer, 1 passthrough, 2 sinks = 5 unique nodes
    expect(result.nodes).toHaveLength(5);

    const sourceNodes = result.nodes.filter((n) => n.role === "source");
    expect(sourceNodes).toHaveLength(1);
    expect(sourceNodes[0]!.label).toBe("req.query.id");

    const sinkNodes = result.nodes.filter((n) => n.role === "sink");
    expect(sinkNodes).toHaveLength(2);
  });

  it("generates compound group container nodes for files when groupByFile is true", () => {
    const result = findingsToInterconnectedGraph(FIXTURE_FINDINGS, {
      groupByFile: true,
    });

    const groupNodes = result.nodes.filter((n) => n.role === "group");
    expect(groupNodes.length).toBeGreaterThan(0);

    const stepNodes = result.nodes.filter((n) => n.role !== "group");
    for (const step of stepNodes) {
      expect(step.parentId).toBeDefined();
      expect(step.extent).toBe("parent");
    }
  });
});

describe("buildUnifiedInterconnectedGraph", () => {
  it("interconnects workspace architecture nodes with taint traces", () => {
    const workspaceGraph: WorkspaceGraph = {
      nodes: [
        {
          id: "file:src/api.ts",
          label: "api.ts",
          type: "file",
          filePath: "src/api.ts",
        },
        {
          id: "func:src/api.ts:handleRequest:10",
          label: "handleRequest()",
          type: "function",
          filePath: "src/api.ts",
          line: 10,
        },
      ],
      edges: [
        {
          id: "e1",
          source: "file:src/api.ts",
          target: "func:src/api.ts:handleRequest:10",
          type: "defines",
        },
      ],
    };

    const result = buildUnifiedInterconnectedGraph(workspaceGraph, FIXTURE_FINDINGS);

    expect(result.nodes.some((n) => n.id === "file:src/api.ts")).toBe(true);
    expect(result.nodes.some((n) => n.id === "func:src/api.ts:handleRequest:10")).toBe(true);
    expect(result.nodes.some((n) => n.role === "source")).toBe(true);
    expect(result.nodes.some((n) => n.role === "sink")).toBe(true);
  });
});

describe("buildBlastRadiusGraph", () => {
  it("organizes threat vectors across 4 trust boundaries into critical assets", () => {
    const result = buildBlastRadiusGraph(FIXTURE_FINDINGS);

    const boundaries = result.nodes.filter((n) => n.role === "boundary");
    expect(boundaries).toHaveLength(4);
    expect(boundaries.some((b) => b.id === "zone-ingress")).toBe(true);
    expect(boundaries.some((b) => b.id === "zone-dmz")).toBe(true);
    expect(boundaries.some((b) => b.id === "zone-core")).toBe(true);
    expect(boundaries.some((b) => b.id === "zone-vault")).toBe(true);

    const assetNodes = result.nodes.filter((n) => n.role === "asset");
    expect(assetNodes.length).toBeGreaterThan(0);
    expect(assetNodes[0]!.parentId).toBe("zone-vault");

    const threatEdges = result.edges.filter((e) => e.type === "threat_vector");
    expect(threatEdges.length).toBeGreaterThan(0);
  });
});

describe("buildControlFlowGraph", () => {
  it("constructs branching decision gate with safe exit and bypass exploit paths", () => {
    const result = buildControlFlowGraph(FIXTURE_FINDINGS[0]);

    const decisionNodes = result.nodes.filter((n) => n.role === "decision");
    expect(decisionNodes).toHaveLength(1);

    const safeExitNodes = result.nodes.filter((n) => n.role === "safe_exit");
    expect(safeExitNodes).toHaveLength(1);

    const sinkNodes = result.nodes.filter((n) => n.role === "sink");
    expect(sinkNodes).toHaveLength(1);

    expect(result.edges.some((e) => e.type === "branch_true")).toBe(true);
    expect(result.edges.some((e) => e.type === "branch_false" && e.tainted)).toBe(true);
  });
});

describe("buildSupplyChainGraph", () => {
  it("maps third-party dependencies and imports to workspace files", () => {
    const workspaceGraph: WorkspaceGraph = {
      nodes: [
        { id: "file:src/api.ts", label: "api.ts", type: "file", filePath: "src/api.ts" },
      ],
      edges: [],
    };

    const result = buildSupplyChainGraph(workspaceGraph, FIXTURE_FINDINGS);

    const packageNodes = result.nodes.filter((n) => n.role === "package");
    expect(packageNodes.length).toBeGreaterThan(0);

    const importEdges = result.edges.filter((e) => e.label === "imports");
    expect(importEdges.length).toBeGreaterThan(0);
  });
});

describe("buildRemoteAttackSurfaceGraph", () => {
  it("returns empty nodes and edges when findings are undefined, empty, or only local SAST findings", () => {
    expect(buildRemoteAttackSurfaceGraph()).toEqual({ nodes: [], edges: [] });
    expect(buildRemoteAttackSurfaceGraph([])).toEqual({ nodes: [], edges: [] });
    // Local SAST findings should not produce any remote attack surface nodes
    expect(buildRemoteAttackSurfaceGraph(FIXTURE_FINDINGS)).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("constructs dynamic host recon topology with exposed endpoints and probes when remote DAST findings exist", () => {
    const result = buildRemoteAttackSurfaceGraph(
      FIXTURE_REMOTE_FINDINGS,
      "scanme.nmap.org",
    );

    const hostNode = result.nodes.find((n) => n.id === "host:scanme.nmap.org");
    expect(hostNode).toBeDefined();
    expect(hostNode?.label).toBe("scanme.nmap.org");

    const endpointNodes = result.nodes.filter((n) => n.role === "endpoint");
    expect(endpointNodes.length).toBeGreaterThan(0);
    expect(endpointNodes).toHaveLength(2);
    expect(endpointNodes.some((e) => e.label === "GET /api/v1/users")).toBe(true);
    expect(endpointNodes.some((e) => e.label === "TCP :80")).toBe(true);

    const probeNodes = result.nodes.filter((n) => n.role === "probe");
    expect(probeNodes.length).toBeGreaterThan(0);
    expect(probeNodes).toHaveLength(2);
    expect(probeNodes.some((p) => p.label.includes("SQL Injection"))).toBe(true);
    expect(probeNodes.some((p) => p.label.includes("Open Port"))).toBe(true);

    // Edges
    const routeEdges = result.edges.filter((e) => e.label === "routes to");
    expect(routeEdges).toHaveLength(2);

    const probeEdges = result.edges.filter((e) => e.label === "probes");
    expect(probeEdges).toHaveLength(2);
  });
  it("filters to vulnerable endpoints only in bugs pipelineMode", () => {
    const bugsResult = buildRemoteAttackSurfaceGraph(
      FIXTURE_REMOTE_FINDINGS,
      "scanme.nmap.org",
      { pipelineMode: "bugs" },
    );
    const fullResult = buildRemoteAttackSurfaceGraph(
      FIXTURE_REMOTE_FINDINGS,
      "scanme.nmap.org",
      { pipelineMode: "full" },
    );

    // bugs mode excludes the low-severity open port finding
    expect(bugsResult.nodes.length).toBeLessThan(fullResult.nodes.length);
    expect(bugsResult.nodes.some((n) => n.label === "TCP :80")).toBe(false);
    expect(bugsResult.nodes.some((n) => n.label === "GET /api/v1/users")).toBe(true);
  });
});

describe("isTestFilePath", () => {
  it("recognizes common test directory and filename conventions", () => {
    expect(isTestFilePath("src/__tests__/foo.test.ts")).toBe(true);
    expect(isTestFilePath("src/components/foo.test.tsx")).toBe(true);
    expect(isTestFilePath("src/components/foo.spec.ts")).toBe(true);
    expect(isTestFilePath("tests/unit/test_widget.py")).toBe(true);
    expect(isTestFilePath("app/widget_test.go")).toBe(true);
    expect(isTestFilePath("test/fixtures/sample.py")).toBe(true);
  });

  it("does not flag ordinary application files", () => {
    expect(isTestFilePath("src/components/Widget.tsx")).toBe(false);
    expect(isTestFilePath("src/api/latest_test_results.ts")).toBe(false);
    expect(isTestFilePath("src/utils/contest.ts")).toBe(false);
  });
});

describe("filterWorkspaceGraphTestFiles", () => {
  const graph: WorkspaceGraph = {
    nodes: [
      { id: "n1", label: "app.ts", type: "file", filePath: "src/app.ts" },
      { id: "n2", label: "app.test.ts", type: "file", filePath: "src/__tests__/app.test.ts" },
      { id: "n3", label: "utils.ts", type: "file", filePath: "src/utils.ts" },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", type: "imports" },
      { id: "e2", source: "n1", target: "n3", type: "imports" },
    ],
  };

  it("removes test-file nodes and any edges touching them when hideTests is true", () => {
    const result = filterWorkspaceGraphTestFiles(graph, true);
    expect(result?.nodes.map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(result?.edges.map((e) => e.id)).toEqual(["e2"]);
  });

  it("returns the graph unmodified when hideTests is false", () => {
    const result = filterWorkspaceGraphTestFiles(graph, false);
    expect(result).toBe(graph);
  });

  it("passes through undefined gracefully", () => {
    expect(filterWorkspaceGraphTestFiles(undefined, true)).toBeUndefined();
  });
});
