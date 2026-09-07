import { describe, expect, it } from "vitest";
import type { Finding, WorkspaceGraph } from "@whoami/types";
import {
  findingsToInterconnectedGraph,
  buildUnifiedInterconnectedGraph,
  buildBlastRadiusGraph,
  buildControlFlowGraph,
  buildSupplyChainGraph,
  buildRemoteAttackSurfaceGraph,
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
  it("constructs dynamic host recon topology with exposed endpoints and probes", () => {
    const result = buildRemoteAttackSurfaceGraph(FIXTURE_FINDINGS, "api.target.internal");

    const hostNode = result.nodes.find((n) => n.id === "host:api.target.internal");
    expect(hostNode).toBeDefined();

    const endpointNodes = result.nodes.filter((n) => n.role === "endpoint");
    expect(endpointNodes.length).toBeGreaterThan(0);

    const probeNodes = result.nodes.filter((n) => n.role === "probe");
    expect(probeNodes.length).toBeGreaterThan(0);
  });

  it("filters to vulnerable endpoints only in bugs pipelineMode", () => {
    const bugsResult = buildRemoteAttackSurfaceGraph(FIXTURE_FINDINGS, "api.target.internal", {
      pipelineMode: "bugs",
    });
    const fullResult = buildRemoteAttackSurfaceGraph(FIXTURE_FINDINGS, "api.target.internal", {
      pipelineMode: "full",
    });

    expect(bugsResult.nodes.length).toBeLessThan(fullResult.nodes.length);
  });
});
