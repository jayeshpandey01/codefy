import type { ReactElement } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDownIcon, RefreshCwIcon } from "../../components/Icons.js";

export interface HopsClusterData extends Record<string, unknown> {
  readonly hopCount: number;
  readonly filePath: string;
  readonly onExpand?: () => void;
  readonly isHighlighted?: boolean;
  readonly isDimmed?: boolean;
}

export function HopsClusterNode(props: NodeProps): ReactElement {
  const data = props.data as HopsClusterData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        data.onExpand?.();
      }}
      className={[
        "relative flex items-center justify-between gap-2 w-[250px] rounded-lg border border-dashed border-[#555555] bg-[#222224] px-3 py-2 shadow-sm transition-all duration-150 cursor-pointer hover:border-[#75BEFF] hover:bg-[#2A2A2D] select-none",
        data.isHighlighted ? "border-[#75BEFF] ring-2 ring-[#75BEFF]/50" : "",
        data.isDimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
      title="Click to expand intermediate propagation steps"
    >
      {/* Target handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-[#75BEFF] !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-[#75BEFF] !w-2 !h-2 !border-none"
      />

      <div className="flex items-center gap-2 min-w-0">
        <RefreshCwIcon size={12} className="text-[#75BEFF] shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-[#D4D4D4] truncate font-mono">
            +{data.hopCount} intermediate hops
          </span>
          <span className="text-[10px] text-[#858585] truncate font-mono">
            in {fileBasename}
          </span>
        </div>
      </div>

      <span className="rounded bg-[#04395E] border border-[#007ACC]/40 px-1.5 py-0.5 text-[9px] font-medium text-[#75BEFF] shrink-0 flex items-center gap-0.5">
        Expand <ChevronDownIcon size={10} className="-rotate-90" />
      </span>

      {/* Source handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-[#75BEFF] !w-2 !h-2 !border-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-[#75BEFF] !w-2 !h-2 !border-none"
      />
    </div>
  );
}
