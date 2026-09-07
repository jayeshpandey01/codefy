import type { ReactElement } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SparklesIcon, ExternalLinkIcon } from "../../components/Icons.js";

export interface AnnotationNodeData extends Record<string, unknown> {
  readonly title: string;
  readonly description: string;
  readonly cwe?: string;
  readonly link?: string;
  readonly category?: "advisory" | "remediation" | "triage";
}

export function AnnotationNode(props: NodeProps): ReactElement {
  const data = props.data as AnnotationNodeData;
  const category = data.category || "advisory";

  return (
    <div
      className={[
        "relative w-[260px] rounded-lg border bg-[#1E1E22]/95 p-2.5 shadow-lg backdrop-blur-md transition-all duration-150 select-none",
        category === "remediation"
          ? "border-[#4EC9B0]/60 text-[#D4D4D4]"
          : "border-[#CCA700]/60 text-[#D4D4D4]",
      ].join(" ")}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-[#CCA700] !w-2 !h-2 !border-none"
      />

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <SparklesIcon size={12} className={category === "remediation" ? "text-[#4EC9B0]" : "text-[#CCA700]"} />
          <span
            className={`text-[9px] font-bold uppercase tracking-wider ${
              category === "remediation" ? "text-[#4EC9B0]" : "text-[#CCA700]"
            }`}
          >
            {category === "remediation" ? "Remediation Hint" : "Security Note"}
          </span>
        </div>
        {data.cwe && (
          <span className="rounded bg-[#252526] border border-[#3C3C3C] px-1 py-0.2 text-[8px] font-mono text-[#CCCCCC]">
            {data.cwe}
          </span>
        )}
      </div>

      <div className="text-xs font-semibold text-[#E0E0E0] mb-0.5 truncate">
        {data.title}
      </div>

      <div className="text-[11px] text-[#A0A0A0] leading-snug line-clamp-3 font-sans">
        {data.description}
      </div>

      {data.link && (
        <a
          href={data.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#75BEFF] hover:underline"
        >
          <span>View Advisory</span>
          <ExternalLinkIcon size={10} />
        </a>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-[#CCA700] !w-2 !h-2 !border-none"
      />
    </div>
  );
}
