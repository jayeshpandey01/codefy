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
import type { Finding, GraphNode, WorkspaceGraph, WorkspaceGraphNode } from "@whoami/types";
import { useGraphLayout } from "./useGraphLayout.js";
import { SourceNode } from "./nodes/SourceNode.js";
import { SinkNode } from "./nodes/SinkNode.js";
import { SanitizerNode } from "./nodes/SanitizerNode.js";
import { PassthroughNode } from "./nodes/PassthroughNode.js";
import { GroupContainerNode } from "./nodes/GroupContainerNode.js";
import { HopsClusterNode } from "./nodes/HopsClusterNode.js";
import { AnnotationNode } from "./nodes/AnnotationNode.js";
import { TaintEdge } from "./edges/TaintEdge.js";
import { AnimatedPulseEdge } from "./edges/AnimatedPulseEdge.js";
import { InteractiveStepEdge } from "./edges/InteractiveStepEdge.js";
import { buildUnifiedInterconnectedGraph } from "./graph-transformers.js";
import {
  AlertTriangleIcon,
  FileCodeIcon,
  FolderIcon,
  ShieldCheckIcon,
} from "../components/Icons.js";

const nodeTypes: NodeTypes = {
  source: SourceNode,
  sink: SinkNode,
  sanitizer: SanitizerNode,
  passthrough: PassthroughNode,
  group: GroupContainerNode,
  cluster: HopsClusterNode,
  annotation: AnnotationNode,
  directory: PassthroughNode,
  file: PassthroughNode,
  class: PassthroughNode,
  function: PassthroughNode,
};

const edgeTypes: EdgeTypes = {
  taint: TaintEdge,
  pulse: AnimatedPulseEdge,
  step: InteractiveStepEdge,
};

export interface UnifiedInterconnectedGraphViewProps {
  readonly workspaceGraph?: WorkspaceGraph;
  readonly findings: readonly Finding[];
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly direction?: "DOWN" | "RIGHT";
  readonly pipelineMode?: "bugs" | "full";
}

export function UnifiedInterconnectedGraphView({
  workspaceGraph,
  findings,
  onNodeClick,
  onJumpToLine,
  direction = "DOWN",
  pipelineMode = "full",
}: UnifiedInterconnectedGraphViewProps): ReactElement {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const filteredFindings = useMemo(() => {
    if (filterSeverity === "all") return findings;
    return findings.filter((f) => f.severity === filterSeverity);
  }, [findings, filterSeverity]);

  const { nodes: unifiedNodes, edges: unifiedEdges } = useMemo(() => {
    return buildUnifiedInterconnectedGraph(workspaceGraph, filteredFindings, { pipelineMode });
  }, [workspaceGraph, filteredFindings, pipelineMode]);

  const { graph, isLayouting, error } = useGraphLayout(
    unifiedNodes,
    unifiedEdges,
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
      for (const e of unifiedEdges) {
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
      for (const e of unifiedEdges) {
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
  }, [activeNodeId, unifiedEdges]);

  const flowNodes: Node[] = useMemo(() => {
    if (!graph) return [];
    const posMap = new Map(graph.nodes.map((n) => [n.id, n]));

    return unifiedNodes.map((n) => {
      const pos = posMap.get(n.id);
      const isHighlighted = highlightedNodeIds.has(n.id);
      const isDimmed = highlightedNodeIds.size > 0 && !isHighlighted;

      return {
        id: n.id,
        type: n.role,
        parentId: n.parentId,
        extent: n.extent,
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        style:
          n.role === "group" || n.role === "boundary"
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
          severity: n.metadata?.highestSeverity || n.metadata?.severity,
          findingCount: n.metadata?.findingCount,
          isHighlighted,
          isDimmed,
          onJumpToLine,
        },
      };
    });
  }, [graph, unifiedNodes, highlightedNodeIds, onJumpToLine]);

  const flowEdges: Edge[] = useMemo(() => {
    return unifiedEdges.map((e) => {
      const isHighlighted = highlightedEdgeIds.has(e.id);
      const isDimmed = highlightedEdgeIds.size > 0 && !isHighlighted;
      const isCallOrTaint = e.type === "calls" || e.type === "pulse" || e.tainted;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: isCallOrTaint ? "pulse" : "taint",
        label: e.label,
        data: {
          tainted: e.tainted,
          isHighlighted,
          isDimmed,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCallOrTaint ? "#F14C4C" : "#75BEFF",
        },
      };
    });
  }, [unifiedEdges, highlightedEdgeIds]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      setActiveNodeId((prev) => (prev === node.id ? null : node.id));
      if (!onNodeClick) return;
      const match = unifiedNodes.find((candidate) => candidate.id === node.id);
      if (match) onNodeClick(match);
    },
    [unifiedNodes, onNodeClick],
  );

  if (error) {
    return (
      <div role="alert" className="p-4 text-sm text-[#F14C4C]">
        Failed to lay out unified graph: {error.message}
      </div>
    );
  }

  if (unifiedNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        No codebase structure or vulnerability flows mapped yet. Run a workspace scan.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        Building unified architecture & security graph…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#1E1E1E] font-sans overflow-hidden select-none">
      {/* Top Filter Bar */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-[#252526]/90 backdrop-blur-md px-2.5 py-1 rounded border border-[#303031] shadow-md text-xs">
        <span className="text-[#CCA700] font-semibold flex items-center gap-1">
          <FolderIcon size={12} />
          Architecture
        </span>
        <span className="text-[#5A5A5A]">&harr;</span>
        <span className="text-[#F14C4C] font-semibold flex items-center gap-1">
          <AlertTriangleIcon size={12} />
          Taint Paths
        </span>

        <span className="text-[#3C3C3C]">|</span>

        {/* Severity filter */}
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded border border-[#3C3C3C] bg-[#1E1E1E] px-1.5 py-0.5 text-[10px] text-[#E0E0E0] outline-none cursor-pointer"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical Only</option>
          <option value="high">High & Above</option>
          <option value="medium">Medium & Above</option>
        </select>

        {activeNodeId && (
          <button
            type="button"
            onClick={() => setActiveNodeId(null)}
            className="rounded bg-[#094771] px-1.5 py-0.2 text-[10px] text-white hover:bg-[#1177BB] cursor-pointer"
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
          nodeColor={(n) => {
            if (n.type === "source") return "#75BEFF";
            if (n.type === "sink") return "#F14C4C";
            if (n.type === "sanitizer") return "#89D185";
            if (n.type === "function") return "#DCDCAA";
            if (n.type === "file") return "#4EC9B0";
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
