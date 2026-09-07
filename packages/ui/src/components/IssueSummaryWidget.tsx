import React from "react";
import type { Finding } from "@whoami/types";

export interface IssueSummaryWidgetProps {
  findings: readonly Finding[];
}

export function IssueSummaryWidget({
  findings,
}: IssueSummaryWidgetProps): React.ReactElement {
  const counts = {
    total: findings.length,
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
  };

  return (
    <div className="grid grid-cols-4 gap-1.5 p-2 font-sans select-none">
      {/* Total Tile */}
      <div className="flex flex-col items-center justify-center rounded border border-[#30363D] bg-[#161B22] py-2 px-1 text-center shadow-sm">
        <span className="text-base font-bold text-[#E6EDF3] leading-none">
          {counts.total}
        </span>
        <span className="text-[9px] font-medium text-[#8B949E] mt-1 leading-tight">
          Total Findings
        </span>
      </div>

      {/* Critical Tile */}
      <div className="flex flex-col items-center justify-center rounded border border-[#F85149]/40 bg-[#F85149]/10 py-2 px-1 text-center shadow-sm">
        <span className="text-base font-bold text-[#F85149] leading-none">
          {counts.critical}
        </span>
        <span className="text-[9px] font-semibold text-[#F85149] mt-1 leading-tight">
          Critical
        </span>
      </div>

      {/* High Tile */}
      <div className="flex flex-col items-center justify-center rounded border border-[#F0883E]/40 bg-[#F0883E]/10 py-2 px-1 text-center shadow-sm">
        <span className="text-base font-bold text-[#F0883E] leading-none">
          {counts.high}
        </span>
        <span className="text-[9px] font-semibold text-[#F0883E] mt-1 leading-tight">
          High
        </span>
      </div>

      {/* Medium Tile */}
      <div className="flex flex-col items-center justify-center rounded border border-[#D29922]/40 bg-[#D29922]/10 py-2 px-1 text-center shadow-sm">
        <span className="text-base font-bold text-[#D29922] leading-none">
          {counts.medium}
        </span>
        <span className="text-[9px] font-semibold text-[#D29922] mt-1 leading-tight">
          Medium
        </span>
      </div>
    </div>
  );
}
