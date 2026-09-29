import { memo, type ReactElement } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { ShieldAlertIcon, ShieldCheckIcon, LockIcon } from "../../components/Icons.js";

const ZONE_THEMES: Record<string, { bg: string; border: string; text: string; icon: typeof ShieldCheckIcon }> = {
  ingress: {
    bg: "bg-vscode-card-selected/15",
    border: "border-vscode-focus/40",
    text: "text-severity-medium",
    icon: ShieldCheckIcon,
  },
  dmz: {
    bg: "bg-severity-high-bg/15",
    border: "border-severity-high/40",
    text: "text-[#FFD700]",
    icon: LockIcon,
  },
  core: {
    bg: "bg-vscode-header/60",
    border: "border-vscode-border/80",
    text: "text-vscode-fg",
    icon: LockIcon,
  },
  secure_vault: {
    bg: "bg-severity-critical-bg/20",
    border: "border-severity-critical/50",
    text: "text-severity-critical",
    icon: ShieldAlertIcon,
  },
};

export const TrustBoundaryNode = memo(function TrustBoundaryNode({
  data,
  selected,
}: NodeProps & { data: TaintNodeData }): ReactElement {
  const zoneKey = (data.category as string) || "core";
  const theme = ZONE_THEMES[zoneKey] || ZONE_THEMES.core!;
  const IconComponent = theme.icon;

  const label = String(data.label || "");
  const count = typeof data.findingCount === "number" ? data.findingCount : 0;
  const description = typeof data.description === "string" ? data.description : undefined;

  return (
    <div
      className={`relative w-full h-full min-w-[300px] min-h-[160px] rounded-xl border-2 border-dashed ${theme.border} ${theme.bg} p-3 font-sans transition-colors duration-200 pointer-events-none select-none backdrop-blur-sm ${
        selected ? "ring-2 ring-vscode-focus shadow-2xl" : "shadow-md"
      }`}
    >
      {/* Top Header Tag */}
      <div className="flex items-center justify-between pointer-events-auto pb-2 border-b border-vscode-border/60">
        <div className="flex items-center gap-2">
          <IconComponent size={14} className={theme.text} />
          <span className={`text-xs font-bold uppercase tracking-wider ${theme.text}`}>
            {label}
          </span>
        </div>
        {count > 0 && (
          <span className="rounded-full bg-severity-critical-bg border border-severity-critical/60 px-2 py-0.5 text-[10px] font-mono font-bold text-severity-critical">
            {count} Threat{count > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {description && (
        <div className="mt-1 text-[11px] text-vscode-muted italic font-mono pointer-events-auto">
          {description}
        </div>
      )}
    </div>
  );
});
