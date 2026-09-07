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
      <div role="alert" className="p-4 text-sm text-[#F14C4C]">
        Failed to lay out control flow graph: {error.message}
      </div>
    );
  }

  if (!activeFinding) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        Select a finding to inspect its control flow branches and sanitizer validation gates.
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        Generating control flow & decision branching diagram…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#1E1E1E] font-sans overflow-hidden select-none">
      {/* Top Banner */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-[#252526]/90 backdrop-blur-md px-2.5 py-1 rounded border border-[#303031] shadow-md text-xs">
        <span className="text-[#FFD700] font-semibold flex items-center gap-1">
          <DiamondIcon size={12} />
          Branching Decision Logic:
        </span>
        <span className="text-[#89D185] font-semibold flex items-center gap-1">
          <ShieldCheckIcon size={12} />
          [True] Safe Exit
        </span>
        <span className="text-[#5A5A5A]">vs</span>
        <span className="text-[#F14C4C] font-semibold flex items-center gap-1">
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
            if (n.type === "decision") return "#CCA700";
            if (n.type === "sink") return "#F14C4C";
            if (n.type === "source") return "#75BEFF";
            if (n.type === "safe_exit") return "#89D185";
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
