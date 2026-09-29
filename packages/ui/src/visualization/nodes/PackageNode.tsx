import { memo, useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { FileCodeIcon, ShieldAlertIcon, ShieldCheckIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export const PackageNode = memo(function PackageNode({
  data,
  selected,
}: NodeProps & { data: TaintNodeData }): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const vulnTotal = (data.findingCount as number) || 0;
  const isVulnerable = vulnTotal > 0 || data.severity === "critical" || data.severity === "high";

  const label = String(data.label || "");
  const category = typeof data.category === "string" ? data.category : "Dependency";
  const description = typeof data.description === "string" ? data.description : undefined;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative w-[240px] max-w-[240px] rounded-lg border bg-vscode-bg p-2.5 font-sans shadow-md transition-colors duration-150 ${
        isVulnerable
          ? "border-severity-critical shadow-[0_0_12px_rgba(241,76,76,0.2)]"
          : "border-vscode-border hover:border-[#4EC9B0]/60"
      } ${selected ? "ring-2 ring-severity-medium" : ""} ${
        data.isDimmed ? "opacity-30" : "opacity-100"
      } ${data.isHighlighted ? "ring-2 ring-[#4EC9B0]" : ""}`}
    >
      <NodeToolbar
        isVisible={isHovered || selected}
        position={Position.Bottom}
        offset={8}
        className="z-50 pointer-events-auto !p-0 !bg-transparent !border-none !shadow-none"
      >
        <NodeInfoCard
          data={data}
          type="package"
          selected={selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>
      {/* Top Header */}
      <div className="flex items-center justify-between gap-1 pb-1 border-b border-vscode-border">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileCodeIcon size={13} className={isVulnerable ? "text-severity-critical" : "text-[#4EC9B0]"} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-vscode-fg">
            {category}
          </span>
        </div>
        {isVulnerable ? (
          <span className="rounded bg-severity-critical-bg border border-severity-critical/60 px-1.5 py-0.2 text-[9px] font-mono font-bold text-severity-critical">
            {vulnTotal} Flaw{vulnTotal !== 1 ? "s" : ""}
          </span>
        ) : (
          <span className="rounded bg-[#09352F] border border-[#4EC9B0]/40 px-1.5 py-0.2 text-[9px] font-mono text-[#4EC9B0]">
            Secure
          </span>
        )}
      </div>

      {/* Package Name */}
      <div className="mt-1 text-xs font-semibold text-vscode-fg truncate" title={label}>
        {label}
      </div>

      {/* Version / Description */}
      {description && (
        <div className="text-[10px] font-mono text-vscode-muted truncate mt-0.5">
          {description}
        </div>
      )}

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!h-2 !w-2 !border-vscode-bg !bg-[#4EC9B0]"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!h-2 !w-2 !border-vscode-bg !bg-[#4EC9B0]"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-2 !w-2 !border-vscode-bg !bg-[#4EC9B0]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-2 !w-2 !border-vscode-bg !bg-[#4EC9B0]"
      />
    </div>
  );
});
