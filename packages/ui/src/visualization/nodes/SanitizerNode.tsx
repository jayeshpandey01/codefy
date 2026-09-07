import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { ShieldCheckIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export function SanitizerNode(props: NodeProps): ReactElement {
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
          ? "border-[#89D185] ring-2 ring-[#89D185] shadow-[0_0_12px_rgba(137,209,133,0.4)]"
          : props.selected
            ? "border-[#4EC9B0] ring-2 ring-[#89D185] ring-offset-1 ring-offset-[#1E1E1E]"
            : "border-[#89D185]/80 hover:border-[#89D185]",
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
          type="sanitizer"
          selected={props.selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Target handles (Left & Top) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-[#89D185] !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-[#89D185] !w-2 !h-2 !border-none"
      />

      {/* Sanitizer Role Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <ShieldCheckIcon size={12} className="text-[#89D185]" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#89D185]">
            Sanitizer Filter
          </span>
        </div>
        <span className="rounded bg-[#16301A] border border-[#4EC9B0]/40 px-1 py-0.2 text-[8px] font-mono text-[#89D185]">
          Guard
        </span>
      </div>

      <div className="truncate text-xs font-mono font-semibold text-[#D4D4D4]" title={data.label}>
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
        className="!bg-[#89D185] !w-2 !h-2 !border-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-[#89D185] !w-2 !h-2 !border-none"
      />
    </div>
  );
}
