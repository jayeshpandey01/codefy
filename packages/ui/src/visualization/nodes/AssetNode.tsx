import { memo, useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { AlertTriangleIcon, DatabaseIcon, ShieldAlertIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export const AssetNode = memo(function AssetNode({
  data,
  selected,
}: NodeProps & { data: TaintNodeData }): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const isCompromised = data.severity === "critical" || data.severity === "high";

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative w-[260px] max-w-[260px] rounded-lg border bg-[#1E1E1E] p-2.5 font-sans shadow-md transition-colors duration-150 ${
        isCompromised
          ? "border-[#F14C4C] shadow-[0_0_15px_rgba(241,76,76,0.25)]"
          : "border-[#CCA700]/70"
      } ${selected ? "ring-2 ring-[#75BEFF]" : ""} ${
        data.isDimmed ? "opacity-30" : "opacity-100"
      } ${data.isHighlighted ? "ring-2 ring-[#F14C4C]" : ""}`}
    >
      <NodeToolbar
        isVisible={isHovered || selected}
        position={Position.Bottom}
        offset={8}
        className="z-50 pointer-events-auto !p-0 !bg-transparent !border-none !shadow-none"
      >
        <NodeInfoCard
          data={data}
          type="asset"
          selected={selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Target Asset Top Bar */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-[#303031]">
        <div className="flex items-center gap-1.5 min-w-0">
          <DatabaseIcon size={14} className={isCompromised ? "text-[#F14C4C]" : "text-[#CCA700]"} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#CCCCCC]">
            Critical Asset
          </span>
        </div>
        <span
          className={`rounded border px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase ${
            isCompromised
              ? "bg-[#3B1212] text-[#F14C4C] border-[#F14C4C]/60 animate-pulse"
              : "bg-[#382F00] text-[#FFD700] border-[#CCA700]/60"
          }`}
        >
          {isCompromised ? "Compromised" : "Target"}
        </span>
      </div>

      {/* Asset Name */}
      <div className="mt-1.5 text-xs font-semibold text-[#E0E0E0] truncate" title={data.label}>
        {data.label}
      </div>

      {/* Location / Meta */}
      {data.filePath && (
        <div className="text-[10px] font-mono text-[#858585] truncate mt-0.5">
          {data.filePath}:{data.line}
        </div>
      )}

      {/* Multi-directional handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#F14C4C]"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#F14C4C]"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#CCA700]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#CCA700]"
      />
    </div>
  );
});
