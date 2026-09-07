import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { AlertTriangleIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export function SinkNode(props: NodeProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const data = props.data as TaintNodeData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;
  const severity = (data.severity as string) || "critical";
  const isCritical = severity === "critical";

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "relative w-[240px] rounded-lg border bg-[#252526] p-2.5 shadow-md transition-colors duration-150 select-none",
        isHighlighted
          ? "border-[#F14C4C] ring-2 ring-[#F14C4C] shadow-[0_0_14px_rgba(241,76,76,0.45)]"
          : props.selected
            ? "border-[#BE1100] ring-2 ring-[#F14C4C] ring-offset-1 ring-offset-[#1E1E1E]"
            : "border-[#F14C4C]/80 hover:border-[#F14C4C]",
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
          type="sink"
          selected={props.selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Target handles (Left & Top) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-[#F14C4C] !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-[#F14C4C] !w-2 !h-2 !border-none"
      />

      {/* Sink Role Header & CWE Badge */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <AlertTriangleIcon size={12} className="text-[#F14C4C]" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#F14C4C]">
            Vulnerable Sink
          </span>
        </div>
        <div className="flex items-center gap-1">
          {data.cwe && (
            <span className="rounded bg-[#1E1E1E] border border-[#303031] px-1 py-0.2 text-[8px] font-mono text-[#CCCCCC]">
              {data.cwe}
            </span>
          )}
          <span
            className={`rounded px-1 py-0.2 text-[8px] font-bold uppercase ${
              isCritical
                ? "bg-[#5A1D1D] text-[#F14C4C] border border-[#BE1100]"
                : "bg-[#382C00] text-[#CCA700] border border-[#CCA700]/50"
            }`}
          >
            {severity}
          </span>
        </div>
      </div>

      <div className="truncate text-xs font-mono font-semibold text-[#D4D4D4]" title={data.label}>
        {data.label}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-[#858585]">
        <span className="truncate max-w-[170px]" title={data.filePath}>
          {fileBasename}:{data.line}
        </span>
      </div>
    </div>
  );
}
