import { useCallback, useMemo, useState, type ReactElement } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Finding, GraphNode, WorkspaceGraph } from "@whoami/types";
import { useGraphLayout } from "./useGraphLayout.js";
import { SourceNode } from "./nodes/SourceNode.js";
import { SinkNode } from "./nodes/SinkNode.js";
import { SanitizerNode } from "./nodes/SanitizerNode.js";
import { PassthroughNode } from "./nodes/PassthroughNode.js";
import { GroupContainerNode } from "./nodes/GroupContainerNode.js";
import { TrustBoundaryNode } from "./nodes/TrustBoundaryNode.js";
import { AssetNode } from "./nodes/AssetNode.js";
import { AnnotationNode } from "./nodes/AnnotationNode.js";
import { TaintEdge } from "./edges/TaintEdge.js";
import { AnimatedPulseEdge } from "./edges/AnimatedPulseEdge.js";
import { InteractiveStepEdge } from "./edges/InteractiveStepEdge.js";
import { buildBlastRadiusGraph } from "./graph-transformers.js";
import { ShieldAlertIcon, ShieldCheckIcon, LockIcon } from "../components/Icons.js";

const nodeTypes: NodeTypes = {
  source: SourceNode,
  sink: SinkNode,
  sanitizer: SanitizerNode,
  passthrough: PassthroughNode,
  group: GroupContainerNode,
  boundary: TrustBoundaryNode,
  asset: AssetNode,
  annotation: AnnotationNode,
};

const edgeTypes: EdgeTypes = {
  taint: TaintEdge,
  pulse: AnimatedPulseEdge,
  threat_vector: AnimatedPulseEdge,
  step: InteractiveStepEdge,
};

export interface BlastRadiusGraphViewProps {
  readonly findings: readonly Finding[];
  readonly workspaceGraph?: WorkspaceGraph;
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly direction?: "DOWN" | "RIGHT";
  readonly pipelineMode?: "bugs" | "full";
}

export function BlastRadiusGraphView({
  findings,
  workspaceGraph,
  onNodeClick,
  onJumpToLine,
  direction = "DOWN",
  pipelineMode = "full",
}: BlastRadiusGraphViewProps): ReactElement {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    return buildBlastRadiusGraph(findings, workspaceGraph, { pipelineMode });
  }, [findings, workspaceGraph, pipelineMode]);

  const { graph, isLayouting, error } = useGraphLayout(
    graphNodes,
    graphEdges,
    direction,
  );

  // Path tracing highlight calculation
  const { highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
    if (!activeNodeId) {
      return {
        highlightedNodeIds: new Set<string>(),
        highlightedEdgeIds: new Set<string>(),
      };
    }

    const nIds = new Set<string>([activeNodeId]);
    const eIds = new Set<string>();

    const queueDown = [activeNodeId];
    while (queueDown.length > 0) {
      const curr = queueDown.shift()!;
      for (const e of graphEdges) {
        if (e.source === curr && !nIds.has(e.target)) {
          nIds.add(e.target);
          eIds.add(e.id);
          queueDown.push(e.target);
        } else if (e.source === curr) {
          eIds.add(e.id);
        }
      }
    }

    const queueUp = [activeNodeId];
    while (queueUp.length > 0) {
      const curr = queueUp.shift()!;
      for (const e of graphEdges) {
        if (e.target === curr && !nIds.has(e.source)) {
          nIds.add(e.source);
          eIds.add(e.id);
          queueUp.push(e.source);
        } else if (e.target === curr) {
          eIds.add(e.id);
        }
      }
    }

    return { highlightedNodeIds: nIds, highlightedEdgeIds: eIds };
  }, [activeNodeId, graphEdges]);

  const flowNodes: Node[] = useMemo(() => {
    if (!graph) return [];
    const posMap = new Map(graph.nodes.map((n) => [n.id, n]));

    return graphNodes.map((n) => {
      const pos = posMap.get(n.id);
      const isHighlighted = highlightedNodeIds.has(n.id);
      const isDimmed = highlightedNodeIds.size > 0 && !isHighlighted && n.role !== "boundary";

      return {
        id: n.id,
        type: n.role,
        parentId: n.parentId,
        extent: n.extent,
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        style:
          n.role === "boundary" || n.role === "group"
            ? {
                width: pos?.width,
                height: pos?.height,
              }
            : undefined,
        data: {
          label: n.label,
          filePath: n.filePath,
          line: n.line,
          role: n.role,
          severity: n.metadata?.severity as string | undefined,
          cwe: n.metadata?.cwe as string | undefined,
          category: n.metadata?.category as string | undefined,
          description: n.metadata?.description as string | undefined,
          isHighlighted,
          isDimmed,
          onJumpToLine,
        },
      };
    });
  }, [graph, graphNodes, highlightedNodeIds, onJumpToLine]);

  const flowEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      const isHighlighted = highlightedEdgeIds.has(e.id);
      const isDimmed = highlightedEdgeIds.size > 0 && !isHighlighted;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "threat_vector",
        label: e.label,
        data: {
          tainted: true,
          animated: true,
          isHighlighted,
          isDimmed,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#F14C4C",
        },
      };
    });
  }, [graphEdges, highlightedEdgeIds]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (node.type === "boundary") return;
      setActiveNodeId((prev) => (prev === node.id ? null : node.id));
      if (!onNodeClick) return;
      const match = graphNodes.find((candidate) => candidate.id === node.id);
      if (match) onNodeClick(match);
    },
    [graphNodes, onNodeClick],
  );

  if (error) {
    return (
      <div role="alert" className="p-4 text-sm text-[#F14C4C]">
        Failed to lay out threat model graph: {error.message}
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        No vulnerability threat vectors to model. Run a scan to analyze blast radius.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        Modeling trust boundaries and threat vectors…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#1E1E1E] font-sans overflow-hidden select-none">
      {/* Top Breadcrumb Bar */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-[#252526]/90 backdrop-blur-md px-2.5 py-1 rounded border border-[#303031] shadow-md text-xs">
        <span className="text-[#75BEFF] font-semibold flex items-center gap-1">
          <ShieldCheckIcon size={12} />
          Ingress
        </span>
        <span className="text-[#5A5A5A]">&rarr;</span>
        <span className="text-[#FFD700] font-semibold flex items-center gap-1">
          <LockIcon size={12} />
          DMZ
        </span>
        <span className="text-[#5A5A5A]">&rarr;</span>
        <span className="text-[#D4D4D4] font-semibold">Core</span>
        <span className="text-[#5A5A5A]">&rarr;</span>
        <span className="text-[#F14C4C] font-semibold flex items-center gap-1">
          <ShieldAlertIcon size={12} />
          Sensitive Assets
        </span>

        {activeNodeId && (
          <button
            type="button"
            onClick={() => setActiveNodeId(null)}
            className="ml-2 rounded bg-[#094771] px-1.5 py-0.2 text-[10px] text-white hover:bg-[#1177BB] cursor-pointer"
          >
            Clear Focus
          </button>
        )}
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={() => setActiveNodeId(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        colorMode="dark"
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#333333" gap={20} />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="!border-[#303031] !bg-[#252526] !shadow-md !rounded"
        />
        <MiniMap
          position="top-right"
          nodeStrokeWidth={3}
          nodeColor={(n: any) => {
            if (n.type === "boundary") return "#2A2D2E";
            if (n.type === "asset") return "#F14C4C";
            if (n.type === "source") return "#75BEFF";
            if (n.type === "sanitizer") return "#89D185";
            return "#3C3C3C";
          }}
          maskColor="rgba(30, 30, 30, 0.75)"
          className="!border-[#303031] !bg-[#252526] !rounded-md !shadow-md !mt-2.5 !mr-2.5"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>
    </div>
  );
}
