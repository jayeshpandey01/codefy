import { memo, useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { RadioIcon, RemoteScanIcon, ShieldAlertIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-[#04395E] text-[#75BEFF] border-[#007ACC]/50",
  POST: "bg-[#16301A] text-[#89D185] border-[#4EC9B0]/50",
  PUT: "bg-[#382F00] text-[#FFD700] border-[#CCA700]/50",
  DELETE: "bg-[#3B1212] text-[#F14C4C] border-[#F14C4C]/50",
  GRAPHQL: "bg-[#2E1A47] text-[#DDA0DD] border-[#BA55D3]/50",
};

export const EndpointNode = memo(function EndpointNode({
  data,
  selected,
}: NodeProps & { data: TaintNodeData }): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const method = (data.category as string) || "GET";
  const methodStyle = METHOD_STYLES[method.toUpperCase()] || METHOD_STYLES.GET!;
  const isVulnerable = data.severity === "critical" || data.severity === "high";

  const label = String(data.label || "");
  const description = typeof data.description === "string" ? data.description : undefined;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative w-[240px] max-w-[240px] rounded-lg border bg-[#1E1E1E] p-2.5 font-sans shadow-md transition-colors duration-150 ${
        isVulnerable
          ? "border-[#F14C4C] shadow-[0_0_12px_rgba(241,76,76,0.25)]"
          : "border-[#303031] hover:border-[#75BEFF]/50"
      } ${selected ? "ring-2 ring-[#75BEFF]" : ""} ${
        data.isDimmed ? "opacity-30" : "opacity-100"
      } ${data.isHighlighted ? "ring-2 ring-[#75BEFF]" : ""}`}
    >
      <NodeToolbar
        isVisible={isHovered || selected}
        position={Position.Bottom}
        offset={8}
        className="z-50 pointer-events-auto !p-0 !bg-transparent !border-none !shadow-none"
      >
        <NodeInfoCard
          data={data}
          type="endpoint"
          selected={selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>
      {/* Top Header */}
      <div className="flex items-center justify-between gap-1 pb-1 border-b border-[#303031]">
        <div className="flex items-center gap-1.5 min-w-0">
          <RemoteScanIcon size={13} className={isVulnerable ? "text-[#F14C4C]" : "text-[#89D185]"} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#CCCCCC]">
            Endpoint Route
          </span>
        </div>
        <span
          className={`rounded border px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase ${methodStyle}`}
        >
          {method}
        </span>
      </div>

      {/* Path */}
      <div className="mt-1 text-xs font-mono font-semibold text-[#E0E0E0] truncate" title={label}>
        {label}
      </div>

      {/* Status / Probe summary */}
      {description && (
        <div className="text-[10px] font-mono text-[#858585] truncate mt-0.5">
          {description}
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#75BEFF]"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#75BEFF]"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#75BEFF]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#75BEFF]"
      />
    </div>
  );
});
