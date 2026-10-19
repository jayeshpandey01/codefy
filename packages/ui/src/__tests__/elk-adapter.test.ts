import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@whoami/types";
import { layoutGraph } from "../visualization/elk-adapter.js";

describe("layoutGraph", () => {
  it("assigns every node a real, distinct position in a top-to-bottom layered layout", async () => {
    // The SQL injection example from CLAUDE.md/dev fixtures:
    // req.params.id -> getProfile() -> db.query(sql)
    const nodes: GraphNode[] = [
      {
        id: "source",
        role: "source",
        label: "req.params.id",
        filePath: "src/routes/profile.ts",
        line: 4,
      },
      {
        id: "passthrough",
        role: "passthrough",
        label: "getProfile(id)",
        filePath: "src/services/profile.ts",
        line: 12,
      },
      {
        id: "sink",
        role: "sink",
        label: "db.query(sql)",
        filePath: "src/db/client.ts",
        line: 30,
      },
    ];
    const edges: GraphEdge[] = [
      {
        id: "e1",
        source: "source",
        target: "passthrough",
        label: "flows to",
        tainted: true,
      },
      {
        id: "e2",
        source: "passthrough",
        target: "sink",
        label: "no sanitizer on path",
        tainted: true,
      },
    ];

    const result = await layoutGraph(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toBe(edges);

    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }

    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    const source = byId.get("source");
    const passthrough = byId.get("passthrough");
    const sink = byId.get("sink");
    expect(source).toBeDefined();
    expect(passthrough).toBeDefined();
    expect(sink).toBeDefined();

    // elk.direction = 'DOWN': each hop should land strictly below the last.
    expect(passthrough!.y).toBeGreaterThan(source!.y);
    expect(sink!.y).toBeGreaterThan(passthrough!.y);

    // No two nodes stacked on top of each other.
    const yValues = result.nodes.map((node) => node.y);
    expect(new Set(yValues).size).toBe(yValues.length);
  });

  it("correctly lays out compound subflow group nodes and relative child positions", async () => {
    const nodes: GraphNode[] = [
      {
        id: "group-routes",
        role: "group",
        label: "routes.ts",
        filePath: "src/routes.ts",
        line: 1,
      },
      {
        id: "n1",
        role: "source",
        label: "req.query.id",
        filePath: "src/routes.ts",
        line: 4,
        parentId: "group-routes",
        extent: "parent",
      },
      {
        id: "group-db",
        role: "group",
        label: "db.ts",
        filePath: "src/db.ts",
        line: 1,
      },
      {
        id: "n2",
        role: "sink",
        label: "db.query()",
        filePath: "src/db.ts",
        line: 20,
        parentId: "group-db",
        extent: "parent",
      },
    ];

    const edges: GraphEdge[] = [
      {
        id: "e1",
        source: "n1",
        target: "n2",
        label: "tainted",
        tainted: true,
      },
    ];

    const result = await layoutGraph(nodes, edges, "DOWN");

    expect(result.nodes).toHaveLength(4);
    for (const node of result.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const child1 = byId.get("n1")!;
    const child2 = byId.get("n2")!;

    expect(child1.parentId).toBe("group-routes");
    expect(child2.parentId).toBe("group-db");
  });

  it("assigns distinct non-overlapping positions to multiple child nodes inside the same trust boundary container", async () => {
    const nodes: GraphNode[] = [
      {
        id: "zone-vault",
        role: "boundary",
        label: "Sensitive Asset Vault",
        filePath: "",
        line: 0,
      },
      {
        id: "asset-1",
        role: "asset",
        label: "fs.readFileSync",
        filePath: "src/test_napi.tsx",
        line: 6,
        parentId: "zone-vault",
        extent: "parent",
      },
      {
        id: "asset-2",
        role: "asset",
        label: "Syntax Error",
        filePath: "src/hero-section.tsx",
        line: 29,
        parentId: "zone-vault",
        extent: "parent",
      },
    ];

    const result = await layoutGraph(nodes, [], "DOWN");

    expect(result.nodes).toHaveLength(3);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const a1 = byId.get("asset-1")!;
    const a2 = byId.get("asset-2")!;

    // Both assets must be inside zone-vault and have distinct positions
    expect(a1.parentId).toBe("zone-vault");
    expect(a2.parentId).toBe("zone-vault");
    expect(a1.x !== a2.x || a1.y !== a2.y).toBe(true);
  });

  it("returns an empty graph for no nodes", async () => {
    const result = await layoutGraph([], []);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("differentiates graphs with identical node/edge counts and does not return stale cached layouts", async () => {
    const graphA_nodes: GraphNode[] = [
      { id: "start", role: "source", label: "Start", filePath: "a.ts", line: 1 },
      { id: "node-A", role: "passthrough", label: "Node A", filePath: "a.ts", line: 2 },
      { id: "end", role: "sink", label: "End", filePath: "a.ts", line: 3 },
    ];
    const graphA_edges: GraphEdge[] = [
      { id: "e1", source: "start", target: "node-A", label: "step 1", tainted: true },
      { id: "e2", source: "node-A", target: "end", label: "step 2", tainted: true },
    ];

    const graphB_nodes: GraphNode[] = [
      { id: "start", role: "source", label: "Start", filePath: "a.ts", line: 1 },
      { id: "node-B", role: "passthrough", label: "Node B", filePath: "b.ts", line: 10 },
      { id: "end", role: "sink", label: "End", filePath: "a.ts", line: 3 },
    ];
    const graphB_edges: GraphEdge[] = [
      { id: "e1", source: "start", target: "node-B", label: "step 1", tainted: true },
      { id: "e2", source: "node-B", target: "end", label: "step 2", tainted: true },
    ];

    const resultA = await layoutGraph(graphA_nodes, graphA_edges, "DOWN");
    const resultB = await layoutGraph(graphB_nodes, graphB_edges, "DOWN");

    const idsA = resultA.nodes.map((n) => n.id);
    const idsB = resultB.nodes.map((n) => n.id);

    expect(idsA).toContain("node-A");
    expect(idsA).not.toContain("node-B");

    expect(idsB).toContain("node-B");
    expect(idsB).not.toContain("node-A");
  });
});
