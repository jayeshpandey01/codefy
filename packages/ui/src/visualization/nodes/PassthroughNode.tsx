import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { RefreshCwIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";
import { useGraphLod } from "../useGraphLod.js";

export function PassthroughNode(props: NodeProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const { isLowLod } = useGraphLod();
  const data = props.data as TaintNodeData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  if (isLowLod) {
    return (
      <div
        className={[
          "relative w-[230px] rounded border bg-vscode-card px-2 py-1 select-none",
          isHighlighted
            ? "border-severity-medium ring-2 ring-severity-medium"
            : "border-vscode-border",
          isDimmed ? "opacity-35" : "opacity-100",
        ].join(" ")}
      >
        <div className="truncate text-xs font-mono text-vscode-fg">
          {data.label}
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="!bg-vscode-dim !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="!bg-vscode-dim !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="!bg-vscode-dim !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="!bg-vscode-dim !w-1.5 !h-1.5 !border-none"
        />
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "relative w-[230px] rounded-lg border bg-vscode-card p-2.5 shadow-md transition-colors duration-150 select-none",
        isHighlighted
          ? "border-severity-medium ring-2 ring-severity-medium shadow-[0_0_12px_rgba(117,190,255,0.3)]"
          : props.selected
            ? "border-vscode-focus ring-2 ring-severity-medium ring-offset-1 ring-offset-vscode-bg"
            : "border-vscode-border hover:border-severity-medium/60",
        isDimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
    >
      <NodeToolbar
        isVisible={isHovered || props.selected}
        position={Position.Bottom}
        offset={8}
        className="z-50 pointer-events-auto !p-0 !bg-transparent !border-none !shadow-none"
      >
        <NodeInfoCard
          data={data}
          type="passthrough"
          selected={props.selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Target handles (Left & Top) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-vscode-dim !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-vscode-dim !w-2 !h-2 !border-none"
      />

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <RefreshCwIcon size={11} className="text-vscode-muted" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-vscode-muted">
            Propagation Hop
          </span>
        </div>
      </div>

      <div className="truncate text-xs font-mono text-vscode-fg" title={data.label}>
        {data.label}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-vscode-muted">
        <span className="truncate max-w-[160px]" title={data.filePath}>
          {fileBasename}:{data.line}
        </span>
      </div>

      {/* Source handles (Right & Bottom) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-vscode-dim !w-2 !h-2 !border-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-vscode-dim !w-2 !h-2 !border-none"
      />
    </div>
  );
}
