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
import { PackageNode } from "./nodes/PackageNode.js";
import { PassthroughNode } from "./nodes/PassthroughNode.js";
import { SourceNode } from "./nodes/SourceNode.js";
import { SinkNode } from "./nodes/SinkNode.js";
import { TaintEdge } from "./edges/TaintEdge.js";
import { AnimatedPulseEdge } from "./edges/AnimatedPulseEdge.js";
import { InteractiveStepEdge } from "./edges/InteractiveStepEdge.js";
import { buildSupplyChainGraph } from "./graph-transformers.js";
import { FileCodeIcon, FolderIcon, ShieldAlertIcon } from "../components/Icons.js";
import {
  GRAPH_MIN_ZOOM,
  GRAPH_MAX_ZOOM,
  GRAPH_DEFAULT_ZOOM,
  GRAPH_DEFAULT_FIT_VIEW_OPTIONS,
} from "./zoom-config.js";
import { GraphZoomControls } from "./GraphZoomControls.js";

const nodeTypes: NodeTypes = {
  package: PackageNode,
  passthrough: PassthroughNode,
  source: SourceNode,
  sink: SinkNode,
};

const edgeTypes: EdgeTypes = {
  taint: TaintEdge,
  pulse: AnimatedPulseEdge,
  step: InteractiveStepEdge,
};

export interface DependencySupplyChainGraphViewProps {
  readonly workspaceGraph?: WorkspaceGraph;
  readonly findings?: readonly Finding[];
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly direction?: "DOWN" | "RIGHT";
  readonly pipelineMode?: "bugs" | "full";
}

export function DependencySupplyChainGraphView({
  workspaceGraph,
  findings,
  onNodeClick,
  onJumpToLine,
  direction = "DOWN",
  pipelineMode = "full",
}: DependencySupplyChainGraphViewProps): ReactElement {
  // React Flow's own built-in dark/light chrome (canvas background,
  // minimap, controls, connection lines) is independent of our
  // data-theme CSS variables -- colorMode must be set explicitly to
  // whichever kind the active app theme is, or it silently defaults to
  // its own hardcoded dark palette regardless of the selected theme.
  const { theme: activeThemeId, themes: allThemes } = useTheme();
  const reactFlowColorMode = allThemes.find((t) => t.id === activeThemeId)?.kind ?? "dark";

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    return buildSupplyChainGraph(workspaceGraph, findings, { pipelineMode });
  }, [workspaceGraph, findings, pipelineMode]);

  const { graph, isLayouting, error } = useGraphLayout(
    graphNodes,
    graphEdges,
    direction,
  );

  const flowNodes: Node[] = useMemo(() => {
    if (!graph) return [];
    const posMap = new Map(graph.nodes.map((n) => [n.id, n]));

    return graphNodes.map((n) => {
      const pos = posMap.get(n.id);
      return {
        id: n.id,
        type: n.role,
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        selected: n.id === activeNodeId,
        data: {
          label: n.label,
          filePath: n.filePath,
          line: n.line,
          role: n.role,
          category: n.metadata?.category as string | undefined,
          findingCount: n.metadata?.findingCount as number | undefined,
          severity: n.metadata?.severity as string | undefined,
          onJumpToLine,
        },
      };
    });
  }, [graph, graphNodes, onJumpToLine, activeNodeId]);

  const flowEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type || "step",
        label: e.label,
        data: {
          tainted: e.tainted,
          animated: e.animated,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.tainted ? "#F14C4C" : "#4EC9B0",
        },
      };
    });
  }, [graphEdges]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
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
        Failed to lay out supply chain graph: {error.message}
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        No third-party packages or module dependencies discovered in the workspace.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        Analyzing supply chain dependencies and package import chains…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-vscode-bg font-sans overflow-hidden select-none">
      {/* Top Banner */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-vscode-card px-2.5 py-1 rounded border border-vscode-border shadow-md text-xs">
        <span className="text-[#4EC9B0] font-semibold flex items-center gap-1">
          <FileCodeIcon size={12} />
          Third-Party Packages
        </span>
        <span className="text-vscode-dim">&rarr;</span>
        <span className="text-vscode-fg font-semibold flex items-center gap-1">
          <FolderIcon size={12} />
          Workspace Consumers
        </span>
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
            if (n.type === "package") return "#4EC9B0";
            if (n.type === "passthrough") return "#DCDCAA";
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
