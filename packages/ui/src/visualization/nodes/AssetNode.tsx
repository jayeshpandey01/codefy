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
      className={`relative w-[260px] max-w-[260px] rounded-lg border bg-vscode-bg p-2.5 font-sans shadow-md transition-colors duration-150 ${
        isCompromised
          ? "border-severity-critical shadow-[0_0_15px_rgba(241,76,76,0.25)]"
          : "border-severity-high/70"
      } ${selected ? "ring-2 ring-severity-medium" : ""} ${
        data.isDimmed ? "opacity-30" : "opacity-100"
      } ${data.isHighlighted ? "ring-2 ring-severity-critical" : ""}`}
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
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-vscode-border">
        <div className="flex items-center gap-1.5 min-w-0">
          <DatabaseIcon size={14} className={isCompromised ? "text-severity-critical" : "text-severity-high"} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-vscode-fg">
            Critical Asset
          </span>
        </div>
        <span
          className={`rounded border px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase ${
            isCompromised
              ? "bg-severity-critical-bg text-severity-critical border-severity-critical/60 animate-pulse"
              : "bg-severity-high-bg text-[#FFD700] border-severity-high/60"
          }`}
        >
          {isCompromised ? "Compromised" : "Target"}
        </span>
      </div>

      {/* Asset Name */}
      <div className="mt-1.5 text-xs font-semibold text-vscode-fg truncate" title={data.label}>
        {data.label}
      </div>

      {/* Location / Meta */}
      {data.filePath && (
        <div className="text-[10px] font-mono text-vscode-muted truncate mt-0.5">
          {data.filePath}:{data.line}
        </div>
      )}

      {/* Multi-directional handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !border-vscode-bg !bg-severity-critical"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !border-vscode-bg !bg-severity-critical"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !border-vscode-bg !bg-severity-high"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !border-vscode-bg !bg-severity-high"
      />
    </div>
  );
});
