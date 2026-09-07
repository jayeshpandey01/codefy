import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { RefreshCwIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export function PassthroughNode(props: NodeProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const data = props.data as TaintNodeData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "relative w-[230px] rounded-lg border bg-[#252526] p-2.5 shadow-md transition-colors duration-150 select-none",
        isHighlighted
          ? "border-[#75BEFF] ring-2 ring-[#75BEFF] shadow-[0_0_12px_rgba(117,190,255,0.3)]"
          : props.selected
            ? "border-[#007ACC] ring-2 ring-[#75BEFF] ring-offset-1 ring-offset-[#1E1E1E]"
            : "border-[#3C3C3C] hover:border-[#75BEFF]/60",
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
        className="!bg-[#555555] !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-[#555555] !w-2 !h-2 !border-none"
      />

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <RefreshCwIcon size={11} className="text-[#858585]" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#858585]">
            Propagation Hop
          </span>
        </div>
      </div>

      <div className="truncate text-xs font-mono text-[#D4D4D4]" title={data.label}>
        {data.label}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-[#858585]">
        <span className="truncate max-w-[160px]" title={data.filePath}>
          {fileBasename}:{data.line}
        </span>
      </div>

      {/* Source handles (Right & Bottom) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-[#555555] !w-2 !h-2 !border-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-[#555555] !w-2 !h-2 !border-none"
      />
    </div>
  );
}
