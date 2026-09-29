import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { ShieldCheckIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";
import { useGraphLod } from "../useGraphLod.js";

export function SanitizerNode(props: NodeProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const { isLowLod } = useGraphLod();
  const data = props.data as TaintNodeData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;

  if (isLowLod) {
    return (
      <div
        className={[
          "relative w-[230px] rounded border bg-vscode-card px-2 py-1 select-none",
          isHighlighted
            ? "border-severity-low ring-2 ring-severity-low"
            : "border-severity-low/70",
          isDimmed ? "opacity-35" : "opacity-100",
        ].join(" ")}
      >
        <div className="truncate text-xs font-mono font-semibold text-severity-low">
          {data.label}
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="!bg-severity-low !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="!bg-severity-low !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className="!bg-severity-low !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="!bg-severity-low !w-1.5 !h-1.5 !border-none"
        />
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "relative w-[230px] rounded-lg border bg-vscode-card p-2.5 shadow-md transition-colors duration-150 select-none",
        isHighlighted
          ? "border-severity-low ring-2 ring-severity-low shadow-[0_0_12px_rgba(137,209,133,0.4)]"
          : props.selected
            ? "border-[#4EC9B0] ring-2 ring-severity-low ring-offset-1 ring-offset-vscode-bg"
            : "border-severity-low/80 hover:border-severity-low",
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
          type="sanitizer"
          selected={props.selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Target handles (Left & Top) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-severity-low !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-severity-low !w-2 !h-2 !border-none"
      />

      {/* Sanitizer Role Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <ShieldCheckIcon size={12} className="text-severity-low" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-severity-low">
            Sanitizer Filter
          </span>
        </div>
        <span className="rounded bg-[#16301A] border border-[#4EC9B0]/40 px-1 py-0.2 text-[8px] font-mono text-severity-low">
          Guard
        </span>
      </div>

      <div className="truncate text-xs font-mono font-semibold text-vscode-fg" title={data.label}>
        {data.label}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-vscode-muted">
        <span className="truncate max-w-[160px]" title={data.filePath}>
          {fileBasename}:{data.line}
        </span>
      </div>

      {/* Source handles (Right & Bottom) */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-severity-low !w-2 !h-2 !border-none"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-severity-low !w-2 !h-2 !border-none"
      />
    </div>
  );
}
