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
          ? "border-[#4EC9B0]/60 text-vscode-fg"
          : "border-severity-high/60 text-vscode-fg",
      ].join(" ")}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-severity-high !w-2 !h-2 !border-none"
      />

      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <SparklesIcon size={12} className={category === "remediation" ? "text-[#4EC9B0]" : "text-severity-high"} />
          <span
            className={`text-[9px] font-bold uppercase tracking-wider ${
              category === "remediation" ? "text-[#4EC9B0]" : "text-severity-high"
            }`}
          >
            {category === "remediation" ? "Remediation Hint" : "Security Note"}
          </span>
        </div>
        {data.cwe && (
          <span className="rounded bg-vscode-card border border-vscode-border px-1 py-0.2 text-[8px] font-mono text-vscode-fg">
            {data.cwe}
          </span>
        )}
      </div>

      <div className="text-xs font-semibold text-vscode-fg mb-0.5 truncate">
        {data.title}
      </div>

      <div className="text-[11px] text-vscode-dim leading-snug line-clamp-3 font-sans">
        {data.description}
      </div>

      {data.link && (
        <a
          href={data.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-severity-medium hover:underline"
        >
          <span>View Advisory</span>
          <ExternalLinkIcon size={10} />
        </a>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-severity-high !w-2 !h-2 !border-none"
      />
    </div>
  );
}
