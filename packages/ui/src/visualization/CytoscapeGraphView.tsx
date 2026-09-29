import { useEffect, useMemo, useRef, type ReactElement } from "react";
import cytoscape, {
  type Core,
  type ElementDefinition,
  type StylesheetJson,
} from "cytoscape";
import type { GraphNode } from "@whoami/types";
import { traceToGraph, type GraphContainerProps } from "./GraphContainer.js";
import { GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM, GRAPH_DEFAULT_ZOOM } from "./zoom-config.js";

/**
 * Second rendering engine for the same TaintTrace -> GraphNode[]/GraphEdge[]
 * data GraphContainer consumes (via the shared traceToGraph mapper) -- picked
 * from the engine dropdown in GraphView. Cytoscape does its own layout
 * (breadthfirst) rather than reusing elk's positions, since bringing its own
 * layout engine is the point of offering it as a second option.
 *
 * Colors are kept in lockstep with the xyflow node/edge components
 * (SourceNode/SinkNode/SanitizerNode/PassthroughNode, TaintEdge) so switching
 * engines from the dropdown doesn't change what a role/edge means visually.
 */
const ROLE_COLOR: Record<GraphNode["role"], { border: string; label: string }> =
  {
    source: { border: "#2dd4bf", label: "#5eead4" },
    sink: { border: "#ef4444", label: "#f87171" },
    sanitizer: { border: "#94a3b8", label: "#cbd5e1" },
    passthrough: { border: "#525252", label: "#a3a3a3" },
    group: { border: "#334155", label: "#94a3b8" },
    cluster: { border: "#eab308", label: "#fde047" },
    annotation: { border: "#eab308", label: "#fde047" },
    boundary: { border: "#334155", label: "#94a3b8" },
    asset: { border: "#ef4444", label: "#f87171" },
    decision: { border: "#eab308", label: "#fde047" },
    safe_exit: { border: "#2dd4bf", label: "#5eead4" },
    package: { border: "#38bdf8", label: "#7dd3fc" },
    endpoint: { border: "#38bdf8", label: "#7dd3fc" },
    probe: { border: "#ef4444", label: "#f87171" },
  };

const TAINTED_STROKE = "#ef4444";
const SAFE_STROKE = "#64748b";
const NODE_BG = "#0f172a";

const stylesheet: StylesheetJson = [
  {
    selector: "node",
    style: {
      shape: "round-rectangle",
      width: 170,
      height: 46,
      "background-color": NODE_BG,
      "background-opacity": 0.95,
      "border-width": 2,
      label: "data(label)",
      color: "#f1f5f9",
      "font-size": 11,
      "font-family": "ui-monospace, monospace",
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "ellipsis",
      "text-max-width": "150px",
    },
  },
  ...(Object.keys(ROLE_COLOR) as GraphNode["role"][]).map((role) => ({
    selector: `node[role = "${role}"]`,
    style: { "border-color": ROLE_COLOR[role].border },
  })),
  {
    selector: "edge",
    style: {
      width: 2,
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "line-color": SAFE_STROKE,
      "target-arrow-color": SAFE_STROKE,
      label: "data(label)",
      "font-size": 9,
      color: "#94a3b8",
      "text-background-color": "#020617",
      "text-background-opacity": 0.85,
      "text-background-padding": "2px",
    },
  },
  {
    selector: "edge[?tainted]",
    style: {
      "line-color": TAINTED_STROKE,
      "target-arrow-color": TAINTED_STROKE,
    },
  },
];

export function CytoscapeGraphView({
  trace,
  onNodeClick,
}: GraphContainerProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { nodes, edges } = useMemo(() => traceToGraph(trace), [trace]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const elements: ElementDefinition[] = [
      ...nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          role: node.role,
          filePath: node.filePath,
          line: node.line,
        },
      })),
      ...edges.map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          tainted: edge.tainted,
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: stylesheet,
      layout: {
        name: "breadthfirst",
        directed: true,
        roots: nodes.filter((n) => n.role === "source").map((n) => n.id),
        spacingFactor: 1.5,
        padding: 24,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      zoom: GRAPH_DEFAULT_ZOOM,
      minZoom: GRAPH_MIN_ZOOM,
      maxZoom: GRAPH_MAX_ZOOM,
      boxSelectionEnabled: false,
      autoungrabify: true,
    });

    if (onNodeClick) {
      cy.on("tap", "node", (event) => {
        const id = event.target.id();
        const match = nodes.find((node) => node.id === id);
        if (match) onNodeClick(match);
      });
    }

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges, onNodeClick]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
