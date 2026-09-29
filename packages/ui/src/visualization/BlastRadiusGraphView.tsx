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
import { useTheme } from "../components/ThemeContext.js";
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
import {
  GRAPH_MIN_ZOOM,
  GRAPH_MAX_ZOOM,
  GRAPH_DEFAULT_ZOOM,
  GRAPH_DEFAULT_FIT_VIEW_OPTIONS,
} from "./zoom-config.js";
import { GraphZoomControls } from "./GraphZoomControls.js";

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
  // React Flow's own built-in dark/light chrome (canvas background,
  // minimap, controls, connection lines) is independent of our
  // data-theme CSS variables -- colorMode must be set explicitly to
  // whichever kind the active app theme is, or it silently defaults to
  // its own hardcoded dark palette regardless of the selected theme.
  const { theme: activeThemeId, themes: allThemes } = useTheme();
  const reactFlowColorMode = allThemes.find((t) => t.id === activeThemeId)?.kind ?? "dark";

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
      <div role="alert" className="p-4 text-sm text-severity-critical">
        Failed to lay out threat model graph: {error.message}
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        No vulnerability threat vectors to model. Run a scan to analyze blast radius.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        Modeling trust boundaries and threat vectors…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-vscode-bg font-sans overflow-hidden select-none">
      {/* Top Breadcrumb Bar */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-vscode-card px-2.5 py-1 rounded border border-vscode-border shadow-md text-xs">
        <span className="text-severity-medium font-semibold flex items-center gap-1">
          <ShieldCheckIcon size={12} />
          Ingress
        </span>
        <span className="text-vscode-dim">&rarr;</span>
        <span className="text-[#FFD700] font-semibold flex items-center gap-1">
          <LockIcon size={12} />
          DMZ
        </span>
        <span className="text-vscode-dim">&rarr;</span>
        <span className="text-vscode-fg font-semibold">Core</span>
        <span className="text-vscode-dim">&rarr;</span>
        <span className="text-severity-critical font-semibold flex items-center gap-1">
          <ShieldAlertIcon size={12} />
          Sensitive Assets
        </span>

        {activeNodeId && (
          <button
            type="button"
            onClick={() => setActiveNodeId(null)}
            className="ml-2 rounded bg-vscode-focus px-1.5 py-0.2 text-[10px] text-white hover:bg-vscode-primary-hover cursor-pointer"
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
        <MiniMap
          position="top-right"
          nodeStrokeWidth={3}
          nodeColor={(n: { type?: string }) => {
            if (n.type === "boundary") return "#2A2D2E";
            if (n.type === "asset") return "#F14C4C";
            if (n.type === "source") return "#75BEFF";
            if (n.type === "sanitizer") return "#89D185";
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
