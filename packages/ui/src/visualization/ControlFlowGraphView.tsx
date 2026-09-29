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
import type { Finding, GraphNode } from "@whoami/types";
import { useGraphLayout } from "./useGraphLayout.js";
import { SourceNode } from "./nodes/SourceNode.js";
import { SinkNode } from "./nodes/SinkNode.js";
import { SanitizerNode } from "./nodes/SanitizerNode.js";
import { DecisionNode } from "./nodes/DecisionNode.js";
import { TaintEdge } from "./edges/TaintEdge.js";
import { AnimatedPulseEdge } from "./edges/AnimatedPulseEdge.js";
import { buildControlFlowGraph } from "./graph-transformers.js";
import { DiamondIcon, ShieldAlertIcon, ShieldCheckIcon } from "../components/Icons.js";
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
  decision: DecisionNode,
  safe_exit: SanitizerNode,
};

const edgeTypes: EdgeTypes = {
  taint: TaintEdge,
  pulse: AnimatedPulseEdge,
  branch_true: TaintEdge,
  branch_false: AnimatedPulseEdge,
};

export interface ControlFlowGraphViewProps {
  readonly finding?: Finding;
  readonly findings?: readonly Finding[];
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly direction?: "DOWN" | "RIGHT";
}

export function ControlFlowGraphView({
  finding,
  findings,
  onNodeClick,
  onJumpToLine,
  direction = "DOWN",
}: ControlFlowGraphViewProps): ReactElement {
  // React Flow's own built-in dark/light chrome (canvas background,
  // minimap, controls, connection lines) is independent of our
  // data-theme CSS variables -- colorMode must be set explicitly to
  // whichever kind the active app theme is, or it silently defaults to
  // its own hardcoded dark palette regardless of the selected theme.
  const { theme: activeThemeId, themes: allThemes } = useTheme();
  const reactFlowColorMode = allThemes.find((t) => t.id === activeThemeId)?.kind ?? "dark";

  const activeFinding = finding || (findings && findings.length > 0 ? findings[0] : undefined);

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    return buildControlFlowGraph(activeFinding);
  }, [activeFinding]);

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
        data: {
          label: n.label,
          filePath: n.filePath,
          line: n.line,
          role: n.role,
          severity: n.metadata?.severity as string | undefined,
          cwe: n.metadata?.cwe as string | undefined,
          onJumpToLine,
        },
      };
    });
  }, [graph, graphNodes, onJumpToLine]);

  const flowEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      const isExploit = e.type === "branch_false" || e.tainted;
      const isSafe = e.type === "branch_true";
      const sourceHandle = isSafe
        ? "left"
        : isExploit && e.source.includes("decision")
          ? "right"
          : undefined;
      const targetHandle = "top";

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle,
        targetHandle,
        type: "step",
        label: e.label,
        labelStyle: {
          fill: isExploit ? "#F14C4C" : "#89D185",
          fontWeight: 600,
          fontSize: 10,
          fontFamily: "monospace",
        },
        labelBgStyle: {
          fill: "#181818",
          fillOpacity: 0.95,
          stroke: isExploit ? "#F14C4C" : "#89D185",
          strokeWidth: 1,
        },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        data: {
          tainted: isExploit,
          animated: isExploit,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isExploit ? "#F14C4C" : "#89D185",
        },
      };
    });
  }, [graphEdges]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (!onNodeClick) return;
      const match = graphNodes.find((candidate) => candidate.id === node.id);
      if (match) onNodeClick(match);
    },
    [graphNodes, onNodeClick],
  );

  if (error) {
    return (
      <div role="alert" className="p-4 text-sm text-severity-critical">
        Failed to lay out control flow graph: {error.message}
      </div>
    );
  }

  if (!activeFinding) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        Select a finding to inspect its control flow branches and sanitizer validation gates.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        Generating control flow & decision branching diagram…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-vscode-bg font-sans overflow-hidden select-none">
      {/* Top Banner */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-vscode-card px-2.5 py-1 rounded border border-vscode-border shadow-md text-xs">
        <span className="text-[#FFD700] font-semibold flex items-center gap-1">
          <DiamondIcon size={12} />
          Branching Decision Logic:
        </span>
        <span className="text-severity-low font-semibold flex items-center gap-1">
          <ShieldCheckIcon size={12} />
          [True] Safe Exit
        </span>
        <span className="text-vscode-dim">vs</span>
        <span className="text-severity-critical font-semibold flex items-center gap-1">
          <ShieldAlertIcon size={12} />
          [False] Bypass Exploit Path
        </span>
      </div>

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
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
            if (n.type === "decision") return "#CCA700";
            if (n.type === "sink") return "#F14C4C";
            if (n.type === "source") return "#75BEFF";
            if (n.type === "safe_exit") return "#89D185";
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
