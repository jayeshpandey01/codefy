import type { ReactElement } from "react";
import type { Severity } from "@whoami/types";

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "bg-[#5A1D1D] text-severity-critical border-[#BE1100]",
  high: "bg-severity-high-bg text-severity-high border-severity-high/50",
  medium: "bg-vscode-card-selected text-severity-medium border-vscode-focus/50",
  low: "bg-[#1E3B20] text-severity-low border-[#4EC9B0]/50",
};

export interface SeverityBadgeProps {
  readonly severity: Severity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_CLASS[severity]}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
