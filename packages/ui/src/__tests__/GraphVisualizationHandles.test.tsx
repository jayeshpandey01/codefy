import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import { SourceNode } from "../visualization/nodes/SourceNode.js";
import { SinkNode } from "../visualization/nodes/SinkNode.js";
import { TrustBoundaryNode } from "../visualization/nodes/TrustBoundaryNode.js";
import { DecisionNode } from "../visualization/nodes/DecisionNode.js";
import { AnnotationNode } from "../visualization/nodes/AnnotationNode.js";
import { traceToGraph } from "../visualization/GraphContainer.js";
import type { TaintTrace } from "@whoami/types";

// Mock @xyflow/react components to inspect handles in jsdom
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    Handle: ({ type, position, id, className }: { type: string; position: string; id?: string; className?: string }) => (
      <div data-testid={`handle-${type}-${position}`} data-handle-id={id} className={className} />
    ),
    NodeToolbar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock("../visualization/useGraphLod.js", () => ({
  useGraphLod: () => ({ isLowLod: false }),
}));

import type { TaintNodeData } from "../visualization/nodes/SourceNode.js";

function createNodeProps(id: string, data: TaintNodeData, type = "default"): NodeProps & { data: TaintNodeData } {
  return {
    id,
    data,
    selected: false,
    type,
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    selectable: false,
    deletable: false,
    draggable: false,
  } as unknown as NodeProps & { data: TaintNodeData };
}

describe("Graph Visualization Node Handles", () => {
  it("renders both target and source handles on SourceNode", () => {
    const props = createNodeProps("src-1", { label: "req.body.name", filePath: "server.ts", line: 12 }, "source");
    const { container } = render(<SourceNode {...props} />);

    // Target handles for inbound architectural links
    expect(container.querySelector('[data-testid="handle-target-left"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-target-top"]')).toBeTruthy();

    // Source handles for outgoing taint propagation
    expect(container.querySelector('[data-testid="handle-source-right"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-source-bottom"]')).toBeTruthy();
  });

  it("renders both target and source handles on SinkNode", () => {
    const props = createNodeProps("sink-1", { label: "db.query()", filePath: "db.ts", line: 45, severity: "critical" }, "sink");
    const { container } = render(<SinkNode {...props} />);

    // Target handles
    expect(container.querySelector('[data-testid="handle-target-left"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-target-top"]')).toBeTruthy();

    // Source handles for downstream annotations / probes / assets
    expect(container.querySelector('[data-testid="handle-source-right"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-source-bottom"]')).toBeTruthy();
  });

  it("renders directional handles on TrustBoundaryNode", () => {
    const props = createNodeProps("zone-1", { label: "Public Ingress Zone", filePath: "", line: 0 }, "boundary");
    const { container } = render(<TrustBoundaryNode {...props} />);

    expect(container.querySelector('[data-testid="handle-target-top"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-target-left"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-source-right"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="handle-source-bottom"]')).toBeTruthy();
  });

  it("renders horizontal and vertical ingress handles on DecisionNode", () => {
    const props = createNodeProps("dec-1", { label: "isValid(input)", filePath: "auth.ts", line: 20 }, "decision");
    const { container } = render(<DecisionNode {...props} />);

    const targetTop = container.querySelector('[data-testid="handle-target-top"]');
    const targetLeft = container.querySelector('[data-testid="handle-target-left"]');
    expect(targetTop).toBeTruthy();
    expect(targetLeft).toBeTruthy();
    expect(targetLeft?.getAttribute("data-handle-id")).toBe("target-left");
  });

  it("renders both left and top target handles on AnnotationNode", () => {
    const props = createNodeProps("annot-1", { label: "SQL Injection Guidance", filePath: "db.ts", line: 45 }, "annotation");
    const { container } = render(<AnnotationNode {...props} />);

    const leftHandle = container.querySelector('[data-testid="handle-target-left"]');
    const topHandle = container.querySelector('[data-testid="handle-target-top"]');
    expect(leftHandle).toBeTruthy();
    expect(topHandle).toBeTruthy();
    expect(leftHandle?.getAttribute("data-handle-id")).toBe("left");
    expect(topHandle?.getAttribute("data-handle-id")).toBe("top");
  });

  it("traceToGraph maps single sequential taint trace without grouping", () => {
    const trace: TaintTrace = {
      sinkClass: "sql-injection",
      steps: [
        { role: "source", label: "req.query.id", filePath: "routes.ts", line: 10 },
        { role: "passthrough", label: "queryId", filePath: "service.ts", line: 15 },
        { role: "sink", label: "pool.query", filePath: "repo.ts", line: 25 },
      ],
    };

    const graph = traceToGraph(trace);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes[0]?.role).toBe("source");
    expect(graph.nodes[1]?.role).toBe("passthrough");
    expect(graph.nodes[2]?.role).toBe("sink");
    expect(graph.edges[0]?.source).toBe(graph.nodes[0]?.id);
    expect(graph.edges[0]?.target).toBe(graph.nodes[1]?.id);
    expect(graph.edges[1]?.source).toBe(graph.nodes[1]?.id);
    expect(graph.edges[1]?.target).toBe(graph.nodes[2]?.id);
  });
});
