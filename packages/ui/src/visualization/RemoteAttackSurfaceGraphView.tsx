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
import { EndpointNode } from "./nodes/EndpointNode.js";
import { TrustBoundaryNode } from "./nodes/TrustBoundaryNode.js";
import { SinkNode } from "./nodes/SinkNode.js";
import { PassthroughNode } from "./nodes/PassthroughNode.js";
import { TaintEdge } from "./edges/TaintEdge.js";
import { AnimatedPulseEdge } from "./edges/AnimatedPulseEdge.js";
import { buildRemoteAttackSurfaceGraph } from "./graph-transformers.js";
import { RemoteScanIcon, ShieldAlertIcon } from "../components/Icons.js";

const nodeTypes: NodeTypes = {
  boundary: TrustBoundaryNode,
  endpoint: EndpointNode,
  probe: SinkNode,
  passthrough: PassthroughNode,
};

const edgeTypes: EdgeTypes = {
  taint: TaintEdge,
  pulse: AnimatedPulseEdge,
};

export interface RemoteAttackSurfaceGraphViewProps {
  readonly findings?: readonly Finding[];
  readonly targetHost?: string;
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly direction?: "DOWN" | "RIGHT";
  readonly pipelineMode?: "bugs" | "full";
}

export function RemoteAttackSurfaceGraphView({
  findings,
  targetHost = "api.target.internal",
  onNodeClick,
  onJumpToLine,
  direction = "DOWN",
  pipelineMode = "full",
}: RemoteAttackSurfaceGraphViewProps): ReactElement {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    return buildRemoteAttackSurfaceGraph(findings, targetHost, { pipelineMode });
  }, [findings, targetHost, pipelineMode]);

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
          category: n.metadata?.category as string | undefined,
          severity: n.metadata?.severity as string | undefined,
          description: n.metadata?.description as string | undefined,
          onJumpToLine,
        },
      };
    });
  }, [graph, graphNodes, onJumpToLine]);

  const flowEdges: Edge[] = useMemo(() => {
    return graphEdges.map((e) => {
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type || "pulse",
        label: e.label,
        data: {
          tainted: e.tainted,
          animated: e.animated,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: e.tainted ? "#F14C4C" : "#75BEFF",
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
      <div role="alert" className="p-4 text-sm text-[#F14C4C]">
        Failed to lay out remote attack surface topology: {error.message}
      </div>
    );
  }

  if (!graph || isLayouting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
        Mapping dynamic endpoints & probe attack topology…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#1E1E1E] font-sans overflow-hidden select-none">
      {/* Top Banner */}
      <div className="absolute top-2.5 left-3 z-10 flex items-center gap-2 bg-[#252526]/90 backdrop-blur-md px-2.5 py-1 rounded border border-[#303031] shadow-md text-xs">
        <span className="text-[#89D185] font-semibold flex items-center gap-1">
          <RemoteScanIcon size={12} />
          Target Host Topology
        </span>
        <span className="text-[#5A5A5A]">&rarr;</span>
        <span className="text-[#75BEFF] font-semibold">Discovered Endpoints</span>
        <span className="text-[#5A5A5A]">&rarr;</span>
        <span className="text-[#F14C4C] font-semibold flex items-center gap-1">
          <ShieldAlertIcon size={12} />
          Exploit Probes
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
            if (n.type === "endpoint") return "#75BEFF";
            if (n.type === "probe") return "#F14C4C";
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
