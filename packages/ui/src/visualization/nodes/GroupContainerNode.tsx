import { useState, type ReactElement } from "react";
import { type NodeProps } from "@xyflow/react";
import { ChevronDownIcon, FileCodeIcon } from "../../components/Icons.js";

export interface GroupNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly filePath: string;
  readonly findingCount?: number;
  readonly highestSeverity?: string;
  readonly onToggleCollapse?: (groupId: string, collapsed: boolean) => void;
}

export function GroupContainerNode(props: NodeProps): ReactElement {
  const data = props.data as GroupNodeData;
  const [collapsed, setCollapsed] = useState(false);

  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : data.label;

  const hasIssues = (data.findingCount ?? 0) > 0;
  const isCritical = data.highestSeverity === "critical";

  return (
    <div
      className={[
        "h-full w-full rounded-xl border bg-[#181818]/70 p-3 shadow-inner backdrop-blur-md transition-colors duration-150 pointer-events-auto select-none",
        props.selected
          ? "border-[#007ACC] ring-1 ring-[#007ACC]/50"
          : hasIssues
            ? isCritical
              ? "border-[#F14C4C]/40 hover:border-[#F14C4C]"
              : "border-[#CCA700]/40 hover:border-[#CCA700]"
            : "border-[#303031] hover:border-[#444444]",
      ].join(" ")}
    >
      {/* Group Header Bar */}
      <div className="flex items-center justify-between border-b border-[#303031] pb-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileCodeIcon size={14} className="text-[#75BEFF] shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-[#D4D4D4] truncate font-sans">
              {fileBasename}
            </span>
            <span className="text-[10px] font-mono text-[#858585] truncate max-w-[200px]" title={data.filePath}>
              {data.filePath}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasIssues && (
            <span
              className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                isCritical
                  ? "bg-[#5A1D1D] text-[#F14C4C] border border-[#BE1100]"
                  : "bg-[#382C00] text-[#CCA700] border border-[#CCA700]/50"
              }`}
            >
              {data.findingCount} flaw{data.findingCount === 1 ? "" : "s"}
            </span>
          )}

          {data.onToggleCollapse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = !collapsed;
                setCollapsed(next);
                data.onToggleCollapse?.(props.id, next);
              }}
              title={collapsed ? "Expand Group" : "Collapse Group"}
              className="p-1 text-[#858585] hover:text-white rounded hover:bg-[#2A2D2E] transition-colors cursor-pointer"
            >
              <ChevronDownIcon
                size={12}
                className={`transition-transform duration-150 ${
                  collapsed ? "-rotate-90" : "rotate-0"
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
