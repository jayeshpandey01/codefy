import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import { RadioIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";

export interface TaintNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly filePath: string;
  readonly line: number;
  readonly role?: string;
  readonly severity?: string;
  readonly cwe?: string;
  readonly isHighlighted?: boolean;
  readonly isDimmed?: boolean;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
  readonly onRunPoc?: () => void;
  readonly onApplyFix?: () => void;
}

export function SourceNode(props: NodeProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const data = props.data as TaintNodeData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "relative w-[230px] rounded-lg border bg-[#252526] p-2.5 shadow-md transition-colors duration-150 select-none",
        isHighlighted
          ? "border-[#75BEFF] ring-2 ring-[#75BEFF] shadow-[0_0_12px_rgba(117,190,255,0.4)]"
          : props.selected
            ? "border-[#007ACC] ring-2 ring-[#007ACC] ring-offset-1 ring-offset-[#1E1E1E]"
            : "border-[#75BEFF]/80 hover:border-[#75BEFF]",
        isDimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
    >
      <NodeToolbar
        isVisible={isHovered || props.selected}
        position={Position.Bottom}
        offset={8}
        className="z-50 pointer-events-auto !p-0 !bg-transparent !border-none !shadow-none"
      >
        <NodeInfoCard
          data={data}
          type="source"
          selected={props.selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>


      {/* Role Pill & Origin Indicator */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <RadioIcon size={11} className="text-[#75BEFF]" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#75BEFF]">
            Taint Source
          </span>
        </div>
        <span className="rounded bg-[#04395E] border border-[#007ACC]/40 px-1 py-0.2 text-[9px] font-mono text-[#75BEFF]">
          Untrusted
        </span>
      </div>

      <div className="truncate text-xs font-mono font-semibold text-[#D4D4D4]" title={data.label}>
        {data.label}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-[#858585]">
        <span className="truncate max-w-[160px]" title={data.filePath}>
          {fileBasename}:{data.line}
        </span>
      </div>

      {/* Multi-directional handles (horizontal & vertical) */}
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
