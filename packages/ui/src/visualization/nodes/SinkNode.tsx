import { useState, type ReactElement } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import type { TaintNodeData } from "./SourceNode.js";
import { AlertTriangleIcon } from "../../components/Icons.js";
import { NodeInfoCard } from "./NodeInfoCard.js";
import { useGraphLod } from "../useGraphLod.js";

export function SinkNode(props: NodeProps): ReactElement {
  const [isHovered, setIsHovered] = useState(false);
  const { isLowLod } = useGraphLod();
  const data = props.data as TaintNodeData;
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const isDimmed = data.isDimmed;
  const isHighlighted = data.isHighlighted;
  const severity = (data.severity as string) || "critical";
  const isCritical = severity === "critical";

  if (isLowLod) {
    return (
      <div
        className={[
          "relative w-[240px] rounded border bg-vscode-card px-2 py-1 select-none",
          isHighlighted
            ? "border-severity-critical ring-2 ring-severity-critical"
            : "border-severity-critical/70",
          isDimmed ? "opacity-35" : "opacity-100",
        ].join(" ")}
      >
        <div className="truncate text-xs font-mono font-semibold text-severity-critical">
          {data.label}
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id="left"
          className="!bg-severity-critical !w-1.5 !h-1.5 !border-none"
        />
        <Handle
          type="target"
          position={Position.Top}
          id="top"
          className="!bg-severity-critical !w-1.5 !h-1.5 !border-none"
        />
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={[
        "relative w-[240px] rounded-lg border bg-vscode-card p-2.5 shadow-md transition-colors duration-150 select-none",
        isHighlighted
          ? "border-severity-critical ring-2 ring-severity-critical shadow-[0_0_14px_rgba(241,76,76,0.45)]"
          : props.selected
            ? "border-[#BE1100] ring-2 ring-severity-critical ring-offset-1 ring-offset-vscode-bg"
            : "border-severity-critical/80 hover:border-severity-critical",
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
          type="sink"
          selected={props.selected}
          onClose={() => setIsHovered(false)}
        />
      </NodeToolbar>

      {/* Target handles (Left & Top) */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-severity-critical !w-2 !h-2 !border-none"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-severity-critical !w-2 !h-2 !border-none"
      />

      {/* Sink Role Header & CWE Badge */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <AlertTriangleIcon size={12} className="text-severity-critical" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-severity-critical">
            Vulnerable Sink
          </span>
        </div>
        <div className="flex items-center gap-1">
          {data.cwe && (
            <span className="rounded bg-vscode-bg border border-vscode-border px-1 py-0.2 text-[8px] font-mono text-vscode-fg">
              {data.cwe}
            </span>
          )}
          <span
            className={`rounded px-1 py-0.2 text-[8px] font-bold uppercase ${
              isCritical
                ? "bg-[#5A1D1D] text-severity-critical border border-[#BE1100]"
                : "bg-severity-high-bg text-severity-high border border-severity-high/50"
            }`}
          >
            {severity}
          </span>
        </div>
      </div>

      <div className="truncate text-xs font-mono font-semibold text-vscode-fg" title={data.label}>
        {data.label}
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-vscode-muted">
        <span className="truncate max-w-[170px]" title={data.filePath}>
          {fileBasename}:{data.line}
        </span>
      </div>
    </div>
  );
}
