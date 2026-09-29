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
import type { Finding, GraphEdge, GraphNode, TaintTrace } from "@whoami/types";
import { useGraphLayout } from "./useGraphLayout.js";
import { SourceNode } from "./nodes/SourceNode.js";
import { SinkNode } from "./nodes/SinkNode.js";
import { SanitizerNode } from "./nodes/SanitizerNode.js";
import { PassthroughNode } from "./nodes/PassthroughNode.js";
import { GroupContainerNode } from "./nodes/GroupContainerNode.js";
import { HopsClusterNode } from "./nodes/HopsClusterNode.js";
import { AnnotationNode } from "./nodes/AnnotationNode.js";
import { TaintEdge, type TaintEdgeData } from "./edges/TaintEdge.js";
import { AnimatedPulseEdge } from "./edges/AnimatedPulseEdge.js";
import { InteractiveStepEdge } from "./edges/InteractiveStepEdge.js";
import type { TaintNodeData } from "./nodes/SourceNode.js";
import { GraphLegend } from "../components/GraphLegend.js";
import { findingsToInterconnectedGraph } from "./graph-transformers.js";
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
};

const edgeTypes: EdgeTypes = {
  taint: TaintEdge,
  pulse: AnimatedPulseEdge,
  step: InteractiveStepEdge,
};

/**
 * Maps a single TaintTrace onto GraphNode[]/GraphEdge[]
 */
export function traceToGraph(trace?: TaintTrace): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  if (!trace) return { nodes: [], edges: [] };
  const nodes: GraphNode[] = trace.steps.map((step, index) => ({
    id: `step-${step.filePath}-${step.line}-${index}`,
    role: step.role,
    label: step.label,
    filePath: step.filePath,
    line: step.line,
  }));

  const hasSanitizer = trace.steps.some((step) => step.role === "sanitizer");

  const edges: GraphEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const source = nodes[index];
    const target = nodes[index + 1];
    if (!source || !target) continue;

    const throughSanitizer =
      source.role === "sanitizer" || target.role === "sanitizer";
    const tainted = !throughSanitizer;

    edges.push({
      id: `edge-${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      label: tainted ? (hasSanitizer ? "unsanitized" : "tainted") : "sanitized",
      tainted,
      type: tainted ? "pulse" : "taint",
      animated: tainted,
    });
  }

  return { nodes, edges };
}

/**
 * Maps a collection of Finding items onto a multi-issue interconnected graph.
 */
export function findingsToGraph(findings: readonly Finding[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  return findingsToInterconnectedGraph(findings, {
    groupByFile: true,
    showAnnotations: true,
  });
}

export interface GraphContainerProps {
  readonly trace?: TaintTrace;
  readonly findings?: readonly Finding[];
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly direction?: "DOWN" | "RIGHT";
  readonly groupByFile?: boolean;
  readonly showAnnotations?: boolean;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly onRunPoc?: (finding: Finding) => void;
  readonly onApplyFix?: (finding: Finding) => void;
  readonly targetFilePath?: string;
}

/**
 * Top-level attack-path & interconnected multi-issue graph component:
 * Layout is computed by useGraphLayout (elkjs with compound subflow support off the render path).
 */
export function GraphContainer({
  trace,
  findings,
  onNodeClick,
  direction = "DOWN",
  groupByFile = true,
  showAnnotations = false,
  onJumpToLine,
  onRunPoc,
  onApplyFix,
  targetFilePath,
}: GraphContainerProps): ReactElement {
  // React Flow's own built-in dark/light chrome (canvas background,
  // minimap, controls, connection lines) is independent of our
  // data-theme CSS variables -- colorMode must be set explicitly to
  // whichever kind the active app theme is, or it silently defaults to
  // its own hardcoded dark palette regardless of the selected theme.
  const { theme: activeThemeId, themes: allThemes } = useTheme();
  const reactFlowColorMode = allThemes.find((t) => t.id === activeThemeId)?.kind ?? "dark";

  const [activeHoverNodeId, setActiveHoverNodeId] = useState<string | null>(null);

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    if (findings && findings.length > 0) {
      return findingsToInterconnectedGraph(findings, {
        groupByFile,
        showAnnotations,
      });
    }
    if (trace) {
      return traceToGraph(trace);
    }
    return { nodes: [], edges: [] };
  }, [trace, findings, groupByFile, showAnnotations]);

  // Focus and select node matching targetFilePath (e.g. from Quick Search)
  useEffect(() => {
    if (!targetFilePath) return;
    const norm = targetFilePath.replace(/\\/g, "/");
    const matched = graphNodes.find((n) => {
      const nNorm = n.filePath?.replace(/\\/g, "/");
      return (
        n.filePath === targetFilePath ||
        (nNorm && (nNorm === norm || norm.endsWith(nNorm) || nNorm.endsWith(norm))) ||
        n.id.includes(norm)
      );
    });
    if (matched) {
      setActiveHoverNodeId(matched.id);
    }
  }, [targetFilePath, graphNodes]);

  const { graph, isLayouting, error } = useGraphLayout(
    graphNodes,
    graphEdges,
    direction,
  );

  // Compute bidirectional connected path (upstream to sources, downstream to sinks)
  const { highlightedNodeIds, highlightedEdgeIds } = useMemo(() => {
    if (!activeHoverNodeId) {
      return {
        highlightedNodeIds: new Set<string>(),
        highlightedEdgeIds: new Set<string>(),
      };
    }

    const nodeIds = new Set<string>([activeHoverNodeId]);
    const edgeIds = new Set<string>();

    // Downstream traversal
    const queueDown = [activeHoverNodeId];
    while (queueDown.length > 0) {
      const curr = queueDown.shift()!;
      for (const edge of graphEdges) {
        if (edge.source === curr && !nodeIds.has(edge.target)) {
          nodeIds.add(edge.target);
          edgeIds.add(edge.id);
          queueDown.push(edge.target);
        } else if (edge.source === curr) {
          edgeIds.add(edge.id);
        }
      }
    }

    // Upstream traversal
    const queueUp = [activeHoverNodeId];
    while (queueUp.length > 0) {
      const curr = queueUp.shift()!;
      for (const edge of graphEdges) {
        if (edge.target === curr && !nodeIds.has(edge.source)) {
          nodeIds.add(edge.source);
          edgeIds.add(edge.id);
          queueUp.push(edge.source);
        } else if (edge.target === curr) {
          edgeIds.add(edge.id);
        }
      }
    }

    return { highlightedNodeIds: nodeIds, highlightedEdgeIds: edgeIds };
  }, [activeHoverNodeId, graphEdges]);

  const flowNodes: Node<TaintNodeData>[] = useMemo(() => {
    if (!graph) return [];
    const positionById = new Map(graph.nodes.map((node) => [node.id, node]));

    return graphNodes.map((node) => {
      const pos = positionById.get(node.id);
      const isHighlighted = highlightedNodeIds.has(node.id);
      const isDimmed =
        highlightedNodeIds.size > 0 && !isHighlighted && node.role !== "group";

      // Match finding for action triggers
      const matchedFinding = findings?.find((f) =>
        f.trace.steps.some(
          (s) => s.filePath === node.filePath && s.line === node.line,
        ),
      );

      return {
        id: node.id,
        type: node.role,
        parentId: node.parentId,
        extent: node.extent,
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        style:
          node.role === "group" || node.role === "boundary"
            ? {
                width: pos?.width,
                height: pos?.height,
              }
            : undefined,
        data: {
          label: node.label,
          filePath: node.filePath,
          line: node.line,
          role: node.role,
          severity: node.metadata?.severity as string | undefined,
          cwe: node.metadata?.cwe as string | undefined,
          title: node.metadata?.title as string | undefined,
          description: node.metadata?.description as string | undefined,
          link: node.metadata?.link as string | undefined,
          category: node.metadata?.category as "advisory" | "remediation" | undefined,
          findingCount: node.metadata?.findingCount as number | undefined,
          highestSeverity: node.metadata?.highestSeverity as string | undefined,
          isHighlighted,
          isDimmed,
          onJumpToLine,
          onRunPoc: matchedFinding && onRunPoc ? () => onRunPoc(matchedFinding) : undefined,
          onApplyFix: matchedFinding && onApplyFix ? () => onApplyFix(matchedFinding) : undefined,
        },
      };
    });
  }, [
    graph,
    graphNodes,
    highlightedNodeIds,
    findings,
    onJumpToLine,
    onRunPoc,
    onApplyFix,
  ]);

  const flowEdges: Edge<TaintEdgeData>[] = useMemo(() => {
    return graphEdges.map((edge) => {
      const isHighlighted = highlightedEdgeIds.has(edge.id);
      const isDimmed = highlightedEdgeIds.size > 0 && !isHighlighted;
      const edgeType = edge.type || (edge.tainted ? "pulse" : "taint");

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: edgeType,
        label: edge.label,
        data: {
          tainted: edge.tainted,
          animated: edge.animated ?? edge.tainted,
          isHighlighted,
          isDimmed,
          payloadExpression: edge.data?.payloadExpression,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.tainted ? "#F14C4C" : "#89D185",
        },
      };
    });
  }, [graphEdges, highlightedEdgeIds]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (node.type === "group") return;
      setActiveHoverNodeId((prev) => (prev === node.id ? null : node.id));

      if (!onNodeClick) return;
      const match = graphNodes.find((candidate) => candidate.id === node.id);
      if (match) onNodeClick(match);
    },
    [graphNodes, onNodeClick],
  );

  const handlePaneClick = useCallback(() => {
    setActiveHoverNodeId(null);
  }, []);

  if (error) {
    return (
      <div role="alert" className="p-4 text-sm text-severity-critical">
        Failed to lay out graph: {error.message}
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        No graph nodes to display.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-vscode-muted">
        Laying out interconnected data flow graph…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-vscode-bg font-sans overflow-hidden select-none">
      {/* Top Left Breadcrumb Bar */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-1.5 text-xs text-vscode-muted font-medium bg-vscode-card px-2.5 py-1 rounded border border-vscode-border shadow-sm">
        <span className="text-severity-medium font-semibold">Sources</span>
        <span className="text-vscode-dim">&gt;</span>
        <span className="text-severity-low font-semibold">Sanitizers</span>
        <span className="text-vscode-dim">&gt;</span>
        <span className="text-severity-critical font-semibold">Sinks</span>
        {activeHoverNodeId && (
          <button
            type="button"
            onClick={() => setActiveHoverNodeId(null)}
            className="ml-2 rounded bg-vscode-focus px-1.5 py-0.2 text-[10px] font-mono text-white hover:bg-vscode-primary-hover cursor-pointer"
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
        onPaneClick={handlePaneClick}
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
        <Background color="var(--color-vscode-border)" gap={18} />
        {/* Controls positioned cleanly at bottom-left */}
        <GraphZoomControls position="bottom-left" />
        <GraphFocusHelper targetNodeId={activeHoverNodeId} />

        {/* MiniMap positioned at top-right with custom role colors */}
        <MiniMap
          position="top-right"
          nodeStrokeWidth={3}
          nodeColor={(n) => {
            if (n.type === "source") return "#75BEFF";
            if (n.type === "sink") return "#F14C4C";
            if (n.type === "sanitizer") return "#89D185";
            if (n.type === "group") return "#2A2D2E";
            if (n.type === "cluster") return "#CCA700";
            if (n.type === "annotation") return "#CCA700";
            return "#3C3C3C";
          }}
          maskColor="rgba(30, 30, 30, 0.75)"
          className="!border-vscode-border !bg-vscode-card !rounded-md !shadow-md !mt-2.5 !mr-2.5"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>

      {/* Floating Legend positioned at bottom-right */}
      <GraphLegend />
    </div>
  );
}
