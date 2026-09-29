import { type ReactElement } from "react";
import {
  ExternalLinkIcon,
  PlayIcon,
  SparklesIcon,
  XIcon,
} from "../../components/Icons.js";
import type { TaintNodeData } from "./SourceNode.js";

export interface NodeInfoCardProps {
  readonly data: TaintNodeData;
  readonly type?: string;
  readonly selected?: boolean;
  readonly onClose?: () => void;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-severity-critical shadow-[0_0_8px_rgba(241,76,76,0.8)]",
  high: "bg-severity-critical shadow-[0_0_6px_rgba(241,76,76,0.6)]",
  medium: "bg-severity-high shadow-[0_0_6px_rgba(204,167,0,0.6)]",
  low: "bg-severity-low shadow-[0_0_6px_rgba(137,209,133,0.6)]",
  info: "bg-severity-medium shadow-[0_0_6px_rgba(117,190,255,0.6)]",
};

const DEFAULT_DOT_BY_TYPE: Record<string, string> = {
  source: "bg-severity-medium",
  sink: "bg-severity-critical",
  sanitizer: "bg-severity-low",
  passthrough: "bg-vscode-muted",
  decision: "bg-[#FFD700]",
  asset: "bg-severity-high",
  package: "bg-[#4EC9B0]",
  endpoint: "bg-severity-medium",
  probe: "bg-severity-critical",
  safe_exit: "bg-severity-low",
};

function getSubtitle(role?: string, type?: string, desc?: string): string {
  if (desc && desc.length < 50) return desc;
  const t = role || type || "";
  switch (t) {
    case "source":
      return "Taint entry point receiving untrusted external input.";
    case "sink":
      return "Sensitive execution sink vulnerable to exploit.";
    case "sanitizer":
      return "Validation filter neutralizing malicious payloads.";
    case "decision":
      return "Conditional branching gate evaluating input validation.";
    case "asset":
      return "High-value asset exposed to dataflow paths.";
    case "package":
      return "Third-party dependency module in import graph.";
    case "endpoint":
      return "Public HTTP / API route discovered in codebase.";
    case "probe":
      return "Dynamic vulnerability verification exploit probe.";
    default:
      return "No detected relationships to other files.";
  }
}

function getRemediationHint(role?: string, type?: string, hint?: string, cwe?: string): string {
  if (hint) return hint;
  if (cwe?.includes("89") || cwe?.toLowerCase().includes("sql")) {
    return "Use parameterized queries or prepared statements instead of string concatenation.";
  }
  if (cwe?.includes("79") || cwe?.toLowerCase().includes("xss")) {
    return "Sanitize and encode all untrusted inputs before rendering to HTML or DOM.";
  }
  if (cwe?.includes("78") || cwe?.toLowerCase().includes("rce")) {
    return "Avoid passing raw parameters to shell execution functions. Use strict argument whitelisting.";
  }
  const t = role || type || "";
  if (t === "sink" || t === "probe") {
    return "A potential flaw was detected here. Validate and sanitize inputs before reaching this execution sink.";
  }
  if (t === "source") {
    return "Ensure input validation and type coercion are applied immediately at ingress boundaries.";
  }
  return "Review data propagation path and ensure proper security boundary enforcement.";
}

export function NodeInfoCard({
  data,
  type = "passthrough",
  selected = false,
  onClose,
}: NodeInfoCardProps): ReactElement {
  const fileBasename = data.filePath
    ? data.filePath.split(/[/\\]/).pop() || data.filePath
    : "";

  const role = (data.role as string) || type;
  const severity = (data.severity as string)?.toLowerCase() || "";
  const dotClass =
    SEVERITY_DOT[severity] ||
    DEFAULT_DOT_BY_TYPE[role] ||
    "bg-vscode-muted";

  const label = String(data.label || fileBasename || "Node");
  const description =
    (data.description as string) ||
    (data.metadata as Record<string, unknown> | undefined)?.description as string ||
    "";
  const hint =
    (data.hint as string) ||
    (data.metadata as Record<string, unknown> | undefined)?.hint as string ||
    "";
  const cwe = (data.cwe as string) || (data.metadata as Record<string, unknown> | undefined)?.cwe as string;
  const category = (data.category as string) || (data.metadata as Record<string, unknown> | undefined)?.category as string;
  const findingCount = (data.findingCount as number) || (data.metadata as Record<string, unknown> | undefined)?.findingCount as number;

  const tag =
    cwe ||
    (category ? category.toUpperCase() : null) ||
    (findingCount ? `${findingCount} FLAWS` : null) ||
    (severity ? severity.toUpperCase() : null) ||
    role.toUpperCase();

  const sourceTag =
    (category ? String(category).toLowerCase() : null) ||
    (cwe ? String(cwe).toLowerCase() : null) ||
    role;

  const subtitle = getSubtitle(role, type, description);
  const remediation = getRemediationHint(role, type, hint, cwe);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-[290px] max-w-[310px] rounded-lg border border-vscode-border bg-vscode-card p-3 text-vscode-fg shadow-2xl backdrop-blur-md font-sans text-left z-50 select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Top Header: Title / Filename + Status Dot + Close button if selected */}
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-bold text-vscode-fg font-mono truncate max-w-[230px]" title={label}>
          {fileBasename || label}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
          {selected && onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title="Close"
              className="p-0.5 text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover rounded transition-colors cursor-pointer"
            >
              <XIcon size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Subtitle / Context (italic) */}
      <div className="text-[10px] text-vscode-muted italic mt-0.5 leading-tight truncate" title={subtitle}>
        {subtitle}
      </div>

      {/* Tag Pill */}
      {tag && (
        <div className="mt-2">
          <span
            className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-mono font-medium ${
              severity === "critical" || severity === "high" || role === "sink" || role === "probe"
                ? "border-severity-critical/60 bg-[#5A1D1D]/30 text-severity-critical"
                : severity === "medium" || role === "decision"
                  ? "border-severity-high/60 bg-severity-high-bg/30 text-severity-high"
                  : severity === "low" || role === "sanitizer"
                    ? "border-[#4EC9B0]/60 bg-[#09352F]/30 text-severity-low"
                    : "border-vscode-focus/50 bg-vscode-card-selected/30 text-severity-medium"
            }`}
          >
            {tag}
          </span>
        </div>
      )}

      {/* Finding Description with square bullet */}
      <div className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug">
        <span
          className={`w-1.5 h-1.5 rounded-[1px] shrink-0 mt-1 ${
            severity === "critical" || severity === "high" || role === "sink" || role === "probe"
              ? "bg-severity-critical"
              : severity === "medium" || role === "decision"
                ? "bg-severity-high"
                : severity === "low" || role === "sanitizer"
                  ? "bg-severity-low"
                  : "bg-severity-medium"
          }`}
        />
        <span className="text-vscode-fg line-clamp-3">
          <strong className="text-vscode-fg font-semibold">{sourceTag} · </strong>
          {description || label}
        </span>
      </div>

      {/* Remediation / Guidance Paragraph */}
      {remediation && (
        <div className="mt-2 border-t border-vscode-card-hover pt-1.5 text-[10px] text-vscode-muted leading-relaxed line-clamp-3">
          {remediation}
        </div>
      )}

      {/* Sinks Action Buttons (PoC / Fix) if provided */}
      {(data.onRunPoc || data.onApplyFix) && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-vscode-card-hover pt-2">
          {data.onRunPoc && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onRunPoc?.();
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-[#16301A] border border-[#4EC9B0]/40 px-2 py-1 text-[10px] font-semibold text-severity-low hover:bg-[#1E3B20] transition-colors cursor-pointer"
            >
              <PlayIcon size={10} />
              <span>Verify PoC</span>
            </button>
          )}
          {data.onApplyFix && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onApplyFix?.();
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-vscode-focus border border-vscode-focus/40 px-2 py-1 text-[10px] font-semibold text-white hover:bg-vscode-primary-hover transition-colors cursor-pointer"
            >
              <SparklesIcon size={10} />
              <span>Apply Fix</span>
            </button>
          )}
        </div>
      )}

      {/* Footer with File link & Open File Button */}
      {data.filePath && (
        <div className="mt-2.5 flex items-center justify-between border-t border-vscode-card-hover pt-2 text-[10px] font-mono text-vscode-muted">
          <span className="truncate max-w-[170px]" title={`${data.filePath}:${data.line || 1}`}>
            {fileBasename}:{data.line || 1}
          </span>
          {data.onJumpToLine && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                data.onJumpToLine?.(data.filePath, data.line || 1);
              }}
              className="flex items-center gap-1 rounded border border-vscode-focus/50 bg-vscode-card-selected/60 hover:bg-vscode-card-selected px-2 py-0.5 text-[10px] font-medium text-severity-medium hover:text-vscode-fg transition-all cursor-pointer"
            >
              <ExternalLinkIcon size={10} />
              <span>Open File</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
