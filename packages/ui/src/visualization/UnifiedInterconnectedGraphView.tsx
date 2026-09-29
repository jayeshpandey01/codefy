import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
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
import { useTheme } from "../components/ThemeContext.js";
import type { Finding, GraphEdge, GraphNode, WorkspaceGraph, WorkspaceGraphNode } from "@whoami/types";
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
import {
  GRAPH_MIN_ZOOM,
  GRAPH_MAX_ZOOM,
  GRAPH_DEFAULT_ZOOM,
  GRAPH_DEFAULT_FIT_VIEW_OPTIONS,
} from "./zoom-config.js";
import { GraphZoomControls } from "./GraphZoomControls.js";
import { GraphFocusHelper } from "./GraphFocusHelper.js";

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
  readonly targetFilePath?: string;
}

export function UnifiedInterconnectedGraphView({
  workspaceGraph,
  findings,
  onNodeClick,
  onJumpToLine,
  direction = "DOWN",
  pipelineMode = "full",
  targetFilePath,
}: UnifiedInterconnectedGraphViewProps): ReactElement {
  // React Flow's own built-in dark/light chrome (canvas background,
  // minimap, controls, connection lines) is independent of our
  // data-theme CSS variables -- colorMode must be set explicitly to
  // whichever kind the active app theme is, or it silently defaults to
  // its own hardcoded dark palette regardless of the selected theme.
  const { theme: activeThemeId, themes: allThemes } = useTheme();
  const reactFlowColorMode = allThemes.find((t) => t.id === activeThemeId)?.kind ?? "dark";

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const filteredFindings = useMemo(() => {
    if (filterSeverity === "all") return findings;
    return findings.filter((f) => f.severity === filterSeverity);
  }, [findings, filterSeverity]);

  const { nodes: unifiedNodes, edges: unifiedEdges } = useMemo(() => {
    return buildUnifiedInterconnectedGraph(workspaceGraph, filteredFindings, { pipelineMode });
  }, [workspaceGraph, filteredFindings, pipelineMode]);

  // Focus and select node matching targetFilePath (e.g. from Quick Search)
  useEffect(() => {
    if (!targetFilePath) return;
    const norm = targetFilePath.replace(/\\/g, "/");
    const matchedNode = unifiedNodes.find((n) => {
      const nNorm = n.filePath?.replace(/\\/g, "/");
      return (
        n.filePath === targetFilePath ||
        (nNorm && (nNorm === norm || norm.endsWith(nNorm) || nNorm.endsWith(norm))) ||
        n.id === `file:${norm}` ||
        n.id.includes(norm)
      );
    });
    if (matchedNode) {
      setActiveNodeId(matchedNode.id);
    }
  }, [targetFilePath, unifiedNodes]);

  const { graph, isLayouting, error } = useGraphLayout(
    unifiedNodes,
    unifiedEdges,
    direction,
  );

  // Precompute adjacency list for O(1) edge lookups during BFS path tracing
  const { downstreamMap, upstreamMap } = useMemo(() => {
    const down = new Map<string, GraphEdge[]>();
    const up = new Map<string, GraphEdge[]>();
    for (const e of unifiedEdges) {
      let downList = down.get(e.source);
      if (!downList) {
        downList = [];
        down.set(e.source, downList);
      }
      downList.push(e);

      let upList = up.get(e.target);
      if (!upList) {
        upList = [];
        up.set(e.target, upList);
      }
      upList.push(e);
    }
    return { downstreamMap: down, upstreamMap: up };
  }, [unifiedEdges]);

  // Path tracing highlight calculation (O(V' + E') via adjacency list)
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
      const outgoing = downstreamMap.get(curr);
      if (outgoing) {
        for (const e of outgoing) {
          eIds.add(e.id);
          if (!nIds.has(e.target)) {
            nIds.add(e.target);
            queueDown.push(e.target);
          }
        }
      }
    }

    const queueUp = [activeNodeId];
    while (queueUp.length > 0) {
      const curr = queueUp.shift()!;
      const incoming = upstreamMap.get(curr);
      if (incoming) {
        for (const e of incoming) {
          eIds.add(e.id);
          if (!nIds.has(e.source)) {
            nIds.add(e.source);
            queueUp.push(e.source);
          }
        }
      }
    }

    return { highlightedNodeIds: nIds, highlightedEdgeIds: eIds };
  }, [activeNodeId, downstreamMap, upstreamMap]);

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
      <div role="alert" className="p-4 text-sm text-severity-critical">
        Failed to lay out unified graph: {error.message}
      </div>
    );
  }

  if (unifiedNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        No codebase structure or vulnerability flows mapped yet. Run a workspace scan.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        Building unified architecture & security graph…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-vscode-bg font-sans overflow-hidden select-none">
      {/* Top Filter Bar */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-vscode-card px-2.5 py-1 rounded border border-vscode-border shadow-md text-xs">
        <span className="text-severity-high font-semibold flex items-center gap-1">
          <FolderIcon size={12} />
          Architecture
        </span>
        <span className="text-vscode-dim">&harr;</span>
        <span className="text-severity-critical font-semibold flex items-center gap-1">
          <AlertTriangleIcon size={12} />
          Taint Paths
        </span>

        <span className="text-vscode-border">|</span>

        {/* Severity filter */}
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded border border-vscode-border bg-vscode-bg px-1.5 py-0.5 text-[10px] text-vscode-fg outline-none cursor-pointer"
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
            className="rounded bg-vscode-focus px-1.5 py-0.2 text-[10px] text-white hover:bg-vscode-primary-hover cursor-pointer"
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
        onlyRenderVisibleElements={false}
        colorMode={reactFlowColorMode}
        minZoom={GRAPH_MIN_ZOOM}
        maxZoom={GRAPH_MAX_ZOOM}
        defaultViewport={{ x: 0, y: 0, zoom: GRAPH_DEFAULT_ZOOM }}
        fitView
        fitViewOptions={GRAPH_DEFAULT_FIT_VIEW_OPTIONS}
        zoomOnScroll={true}
        zoomOnPinch={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--color-vscode-border)" gap={20} />
        <GraphZoomControls position="bottom-left" />
        <GraphFocusHelper targetNodeId={activeNodeId} />
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
          className="!border-vscode-border !bg-vscode-card !rounded-md !shadow-md !mt-2.5 !mr-2.5"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>
    </div>
  );
}
