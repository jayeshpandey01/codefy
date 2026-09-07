import { memo, useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { DiamondIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export const DecisionNode = memo(function DecisionNode({
  data,
  selected,
}: NodeProps & { data: TaintNodeData }): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative w-[240px] max-w-[240px] rounded-lg border border-[#CCA700] bg-[#252526] p-2.5 font-sans shadow-md transition-colors duration-150 ${
        selected ? "ring-2 ring-[#75BEFF]" : ""
      } ${data.isDimmed ? "opacity-30" : "opacity-100"} ${
        data.isHighlighted ? "ring-2 ring-[#CCA700]" : ""
      }`}
    >
      <NodeToolbar
        isVisible={isHovered || selected}
        position={Position.Bottom}
        offset={8}
        className="z-50 pointer-events-auto !p-0 !bg-transparent !border-none !shadow-none"
      >
        <NodeInfoCard
          data={data}
          type="decision"
          selected={selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Decision Header */}
      <div className="flex items-center justify-between gap-1 pb-1 border-b border-[#3C3C3C]">
        <div className="flex items-center gap-1.5 min-w-0">
          <DiamondIcon size={13} className="text-[#FFD700]" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFD700]">
            Condition / Guard
          </span>
        </div>
        <span className="rounded bg-[#382F00] border border-[#CCA700]/40 px-1 py-0.2 text-[9px] font-mono text-[#FFD700]">
          Branch Gate
        </span>
      </div>

      {/* Condition Expression */}
      <div className="mt-1 text-xs font-mono text-[#DCDCAA] truncate font-semibold" title={data.label}>
        {data.label}
      </div>

      {/* Code reference */}
      {data.filePath && (
        <div className="text-[10px] font-mono text-[#858585] truncate mt-0.5">
          {data.filePath}:{data.line}
        </div>
      )}

      {/* Ingress handle (Top) */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2.5 !w-2.5 !border-[#1E1E1E] !bg-[#CCA700]"
      />

      {/* True / Sanitized Branch (Left) */}
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!h-2.5 !w-2.5 !border-[#1E1E1E] !bg-[#89D185]"
      />

      {/* False / Exploit Bypass Branch (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2.5 !w-2.5 !border-[#1E1E1E] !bg-[#F14C4C]"
      />

      {/* Alternative Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !border-[#1E1E1E] !bg-[#CCA700]"
      />
    </div>
  );
});
