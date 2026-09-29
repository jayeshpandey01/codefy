import React, { useState } from "react";
import { type StructuredErrorPayload, toStructuredError } from "@whoami/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  XIcon,
} from "./Icons.js";

export interface ActionableErrorBannerProps {
  error: StructuredErrorPayload | string | Error | null | undefined;
  title?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ActionableErrorBanner({
  error,
  title,
  onDismiss,
  onRetry,
  className = "",
  compact = false,
}: ActionableErrorBannerProps): React.ReactElement | null {
  const [copied, setCopied] = useState(false);

  if (!error) return null;

  const err: StructuredErrorPayload =
    typeof error === "string" || error instanceof Error
      ? toStructuredError(error)
      : error;

  const handleCopyFix = async () => {
    if (!err.fix) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(err.fix);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback or ignore clipboard permission error
    }
  };

  const tag =
    err.scope && err.code ? `${err.scope}:${err.code}` : err.code || err.scope;

  if (compact) {
    return (
      <div
        role="alert"
        className={`flex items-center justify-between gap-2 rounded border border-[#BE1100] bg-[#3B1515] px-2.5 py-1.5 text-xs text-[#F87171] ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangleIcon size={14} className="shrink-0 text-[#F87171]" />
          {tag && (
            <span className="shrink-0 rounded border border-[#7F1D1D] bg-[#2A1111] px-1 py-0.2 text-[10px] font-mono text-[#FCA5A5]">
              {tag}
            </span>
          )}
          <span className="truncate">{err.message}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              title="Retry operation"
              className="rounded p-1 text-vscode-fg hover:bg-[#4D1D1D] transition-colors cursor-pointer"
            >
              <RefreshCwIcon size={12} />
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              title="Dismiss error"
              className="rounded p-1 text-vscode-fg hover:bg-[#4D1D1D] transition-colors cursor-pointer"
            >
              <XIcon size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={`rounded-md border border-[#BE1100] bg-[#2A1414] p-3 text-xs text-vscode-fg shadow-md transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangleIcon
            size={16}
            className="shrink-0 text-[#F87171] mt-0.5"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {title && (
                <span className="font-semibold text-white">{title}</span>
              )}
              {tag && (
                <span className="rounded border border-[#7F1D1D] bg-[#3B1515] px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#FCA5A5]">
                  [{tag}]
                </span>
              )}
              {err.statusCode && (
                <span className="rounded bg-vscode-bg px-1.5 py-0.5 text-[10px] font-mono text-vscode-muted border border-vscode-border">
                  HTTP {err.statusCode}
                </span>
              )}
            </div>
            <div className="mt-1 font-medium text-[#F87171] break-words">
              {err.message}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              title="Retry operation"
              className="flex items-center gap-1 rounded border border-vscode-border bg-vscode-bg px-2 py-1 text-[11px] text-vscode-fg hover:bg-vscode-card-hover hover:text-vscode-fg transition-colors cursor-pointer"
            >
              <RefreshCwIcon size={11} />
              <span>Retry</span>
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              title="Dismiss error"
              className="rounded p-1 text-vscode-muted hover:bg-[#3B1515] hover:text-white transition-colors cursor-pointer"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Structured Details: Reason, Hint, Fix, Link */}
      {(err.reason || err.hint || err.fix || err.link) && (
        <div className="mt-3 flex flex-col gap-2 border-t border-[#4D1D1D] pt-2.5">
          {/* Reason / Why */}
          {err.reason && (
            <div className="flex items-start gap-2 text-[11px] text-vscode-fg">
              <span className="shrink-0 font-semibold text-vscode-muted">
                Why:
              </span>
              <span className="break-words leading-relaxed">{err.reason}</span>
            </div>
          )}

          {/* Hint / Suggestion */}
          {err.hint && (
            <div className="flex items-start gap-2 rounded bg-[#2D2214] border border-[#6B4B1B] px-2.5 py-1.5 text-[11px] text-[#FDE68A]">
              <span className="shrink-0 font-semibold text-[#F59E0B]">
                💡 Hint:
              </span>
              <span className="break-words leading-relaxed">{err.hint}</span>
            </div>
          )}

          {/* Fix / Remediation */}
          {err.fix && (
            <div className="rounded border border-[#27382B] bg-[#142017] p-2 text-[11px]">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[#4ADE80]">
                  🔧 Suggested Fix:
                </span>
                <button
                  type="button"
                  onClick={handleCopyFix}
                  className="flex items-center gap-1 rounded bg-[#1C2C20] px-1.5 py-0.5 text-[10px] text-[#86EFAC] hover:bg-[#233B28] transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <CheckIcon size={10} className="text-[#4ADE80]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={10} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-[10.5px] text-[#A7F3D0] break-all select-all bg-[#0D1610] p-1.5 rounded">
                {err.fix}
              </div>
            </div>
          )}

          {/* Link / Documentation */}
          {err.link && (
            <div className="flex items-center justify-end text-[11px]">
              <a
                href={err.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[#4FC1FF] hover:underline hover:text-[#9CDCFE] transition-colors"
              >
                <span>Documentation / References</span>
                <ExternalLinkIcon size={11} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
