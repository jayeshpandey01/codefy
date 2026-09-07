import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Finding } from "@whoami/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  ColumnsIcon,
  RefreshCwIcon,
  RowsIcon,
  WandIcon,
  XIcon,
} from "./Icons.js";
import { SeverityBadge } from "./SeverityBadge.js";
import {
  generateFindingDiff,
  tokenizeCode,
  type AlignedDiffRow,
  type DiffLine,
} from "./diffUtils.js";

export interface DiffPreviewModalProps {
  readonly finding: Finding;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onApplyFix: (finding: Finding) => Promise<boolean | void> | void;
}

type ViewMode = "split" | "unified";

/**
 * Tokenized code snippet renderer with VS Code Dark Modern syntax coloring
 */
function HighlightedCode({ text }: { text: string }): React.ReactElement {
  const tokens = useMemo(() => tokenizeCode(text), [text]);

  if (tokens.length === 0) {
    return <span className="inline-block">&nbsp;</span>;
  }

  return (
    <>
      {tokens.map((token, idx) => {
        let colorClass = "text-[#D4D4D4]";

        switch (token.type) {
          case "keyword":
            colorClass = "text-[#C586C0]"; // purple/blue keyword
            break;
          case "string":
            colorClass = "text-[#CE9178]"; // orange/brown string
            break;
          case "comment":
            colorClass = "text-[#6A9955] italic"; // green comment
            break;
          case "type":
            colorClass = "text-[#4EC9B0]"; // teal type
            break;
          case "function":
            colorClass = "text-[#DCDCAA]"; // yellow function
            break;
          case "tag":
            colorClass = "text-[#569CD6]"; // blue tag
            break;
          default:
            colorClass = "text-[#D4D4D4]";
        }

        return (
          <span key={idx} className={colorClass}>
            {token.text}
          </span>
        );
      })}
    </>
  );
}

/**
 * Hatching background pattern for empty/filler rows
 */
const HATCHED_BG_STYLE: React.CSSProperties = {
  background:
    "repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.035) 6px, transparent 6px, transparent 12px)",
};

/**
 * Renders a single cell in the split diff view
 */
function SplitCell({ line }: { line: DiffLine }): React.ReactElement {
  if (line.type === "empty") {
    return (
      <div
        style={HATCHED_BG_STYLE}
        className="flex h-6 w-full items-center border-b border-[#252526]/30 select-none"
      >
        <div className="w-12 shrink-0 border-r border-[#303031]/50 bg-[#161616] px-2 py-0.5 text-right font-mono text-xs text-transparent">
          &nbsp;
        </div>
        <div className="flex-1 px-3 py-0.5 text-xs font-mono text-transparent">
          &nbsp;
        </div>
      </div>
    );
  }

  const isDeleted = line.type === "deleted";
  const isAdded = line.type === "added";

  let rowBg = "hover:bg-[#2A2D2E]/40";
  let gutterBg = "bg-[#181818] text-[#6A6A6A]";
  let prefixText = " ";
  let prefixColor = "text-[#6A6A6A]";

  if (isDeleted) {
    rowBg = "bg-[#5A1D1D]/35 hover:bg-[#5A1D1D]/50 border-l-2 border-[#BE1100]";
    gutterBg = "bg-[#4D1515] text-[#F14C4C] font-semibold";
    prefixText = "-";
    prefixColor = "text-[#F14C4C] font-bold";
  } else if (isAdded) {
    rowBg = "bg-[#1E3B20]/35 hover:bg-[#1E3B20]/50 border-l-2 border-[#4EC9B0]";
    gutterBg = "bg-[#16301A] text-[#89D185] font-semibold";
    prefixText = "+";
    prefixColor = "text-[#89D185] font-bold";
  }

  return (
    <div
      className={`flex h-6 w-full items-center border-b border-[#252526]/40 transition-colors ${rowBg}`}
    >
      {/* Gutter (Line Number + Prefix Symbol) */}
      <div
        className={`flex w-12 shrink-0 items-center justify-between border-r border-[#303031] px-1.5 py-0.5 font-mono text-xs select-none ${gutterBg}`}
      >
        <span className="w-6 text-right">{line.lineNum}</span>
        <span className={`w-3 text-center text-[11px] ${prefixColor}`}>
          {prefixText}
        </span>
      </div>

      {/* Code Text Content */}
      <div className="flex-1 overflow-x-auto px-3 py-0.5 font-mono text-xs leading-snug whitespace-pre">
        <HighlightedCode text={line.text} />
      </div>
    </div>
  );
}

/**
 * Full Screen Interactive Diff Preview Modal with side-by-side code changes and Apply Fix confirmation.
 */
export function DiffPreviewModal({
  finding,
  isOpen,
  onClose,
  onApplyFix,
}: DiffPreviewModalProps): React.ReactElement | null {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [fixState, setFixState] = useState<
    "idle" | "applying" | "applied" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const diffResult = useMemo(() => generateFindingDiff(finding), [finding]);

  if (!isOpen) return null;

  const handleApply = async () => {
    setFixState("applying");
    setErrorMessage(null);
    try {
      const result = await onApplyFix(finding);
      if (result === false) {
        setFixState("error");
        setErrorMessage("Host rejected fix application.");
      } else {
        setFixState("applied");
        setTimeout(() => {
          setFixState("idle");
          onClose();
        }, 1200);
      }
    } catch (err) {
      setFixState("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const steps = finding.trace?.steps || [];
  const primaryStep = steps[steps.length - 1] || steps[0];

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-modal-title"
      className="fixed inset-0 z-[99999] flex flex-col bg-[#1E1E1E] text-[#D4D4D4] font-sans select-none overflow-hidden animate-in fade-in duration-150"
    >
      {/* Top Header: File Breadcrumb & Action Bar */}
      <header className="flex h-11 items-center justify-between border-b border-[#303031] bg-[#181818] px-4 shrink-0 z-20">
        <div className="flex items-center gap-3 overflow-x-auto min-w-0 pr-2">
          {/* Breadcrumb path: e.g. app > layout.tsx > line 4 */}
          <div className="flex items-center gap-1.5 font-mono text-xs text-[#858585] shrink-0">
            {diffResult.breadcrumb.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRightIcon size={12} className="text-[#555555]" />}
                <span
                  className={
                    idx === diffResult.breadcrumb.length - 1
                      ? "text-[#E0E0E0] font-semibold"
                      : "text-[#858585]"
                  }
                >
                  {crumb}
                </span>
              </React.Fragment>
            ))}
            {primaryStep && (
              <>
                <ChevronRightIcon size={12} className="text-[#555555]" />
                <span className="text-[#75BEFF] font-semibold">L{primaryStep.line}</span>
              </>
            )}
          </div>

          <div className="h-4 w-[1px] bg-[#303031] mx-1 shrink-0" />

          {/* Severity and Title */}
          <div className="flex items-center gap-2 min-w-0 truncate">
            <SeverityBadge severity={finding.severity} />
            <span
              id="diff-modal-title"
              className="text-xs font-semibold text-[#E0E0E0] truncate"
            >
              {finding.title}
            </span>
            <span className="rounded border border-[#007ACC]/40 bg-[#04395E]/50 px-1.5 py-0.2 text-[10px] font-mono text-[#75BEFF] shrink-0">
              [{finding.scope || "security"}:{finding.code || finding.ruleId}]
            </span>
          </div>
        </div>

        {/* Right Controls: Stats, View mode toggle & Top-Right Cancel (X) button */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="rounded bg-[#5A1D1D]/60 border border-[#BE1100]/50 px-1.5 py-0.2 text-[11px] text-[#F14C4C] font-semibold">
              -{diffResult.deletionsCount}
            </span>
            <span className="rounded bg-[#1E3B20]/60 border border-[#4EC9B0]/50 px-1.5 py-0.2 text-[11px] text-[#89D185] font-semibold">
              +{diffResult.additionsCount}
            </span>
          </div>

          <div className="flex items-center rounded border border-[#3C3C3C] bg-[#252526] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              title="Side-by-side Split View"
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "split"
                  ? "bg-[#0E639C] text-white"
                  : "text-[#858585] hover:text-[#D4D4D4]"
              }`}
            >
              <ColumnsIcon size={13} />
              <span>Split</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("unified")}
              title="Unified Inline View"
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "unified"
                  ? "bg-[#0E639C] text-white"
                  : "text-[#858585] hover:text-[#D4D4D4]"
              }`}
            >
              <RowsIcon size={13} />
              <span>Unified</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={fixState === "applying"}
            title="Cancel and close diff viewer"
            className="flex items-center justify-center rounded-md p-1.5 text-[#858585] hover:bg-[#2A2D2E] hover:text-white active:bg-[#323233] transition-colors cursor-pointer disabled:opacity-50"
          >
            <XIcon size={16} />
          </button>
        </div>
      </header>

      {/* Center Full-Height Code Comparison Canvas */}
      <main className="flex-1 w-full min-h-0 overflow-auto bg-[#1E1E1E] relative">
        {viewMode === "split" ? (
          <div className="flex flex-col min-w-full">
            {/* Split Column Headers */}
            <div className="flex border-b border-[#303031] bg-[#181818] sticky top-0 z-10 font-mono text-[11px] uppercase font-bold tracking-wider select-none">
              <div className="w-1/2 flex items-center justify-between px-4 py-1.5 text-[#F14C4C] border-r border-[#303031]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#F14C4C]" />
                  <span>Original Code (Previous)</span>
                </div>
                <span className="text-[10px] text-[#858585]">BEFORE</span>
              </div>
              <div className="w-1/2 flex items-center justify-between px-4 py-1.5 text-[#89D185]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#89D185]" />
                  <span>Proposed Fix (Changes)</span>
                </div>
                <span className="text-[10px] text-[#858585]">AFTER</span>
              </div>
            </div>

            {/* Split Diff Rows */}
            <div className="flex flex-col divide-y-0">
              {diffResult.rows.map((row: AlignedDiffRow, index: number) => (
                <div key={index} className="flex w-full">
                  {/* Left Pane (Original / Before) */}
                  <div className="w-1/2 min-w-0 border-r border-[#303031]">
                    <SplitCell line={row.left} />
                  </div>

                  {/* Right Pane (Modified / After) */}
                  <div className="w-1/2 min-w-0">
                    <SplitCell line={row.right} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Unified (Inline) Diff View */
          <div className="flex flex-col min-w-full">
            <div className="border-b border-[#303031] bg-[#181818] sticky top-0 z-10 px-4 py-1.5 font-mono text-[11px] uppercase font-bold tracking-wider text-[#858585]">
              Unified Changes View
            </div>
            <div className="flex flex-col">
              {diffResult.rows.map((row: AlignedDiffRow, index: number) => {
                if (
                  row.left.type === "unchanged" &&
                  row.right.type === "unchanged"
                ) {
                  return (
                    <div
                      key={index}
                      className="flex h-6 w-full items-center border-b border-[#252526]/40 hover:bg-[#2A2D2E]/40"
                    >
                      <div className="flex w-16 shrink-0 items-center justify-between border-r border-[#303031] bg-[#181818] px-1.5 py-0.5 font-mono text-xs text-[#858585] select-none">
                        <span className="w-6 text-right">
                          {row.left.lineNum}
                        </span>
                        <span className="w-6 text-right">
                          {row.right.lineNum}
                        </span>
                      </div>
                      <div className="w-4 text-center font-mono text-[11px] text-[#858585]">
                        &nbsp;
                      </div>
                      <div className="flex-1 overflow-x-auto px-2 py-0.5 font-mono text-xs leading-snug whitespace-pre">
                        <HighlightedCode text={row.left.text} />
                      </div>
                    </div>
                  );
                }

                return (
                  <React.Fragment key={index}>
                    {row.left.type === "deleted" && (
                      <div className="flex h-6 w-full items-center border-b border-[#2A2A2B]/40 bg-[#5A1D1D]/35 hover:bg-[#5A1D1D]/50 border-l-2 border-[#BE1100]">
                        <div className="flex w-16 shrink-0 items-center justify-between border-r border-[#303031] bg-[#4D1515] px-1.5 py-0.5 font-mono text-xs text-[#F14C4C] font-semibold select-none">
                          <span className="w-6 text-right">
                            {row.left.lineNum}
                          </span>
                          <span className="w-6 text-right text-transparent">
                            -
                          </span>
                        </div>
                        <div className="w-4 text-center font-mono text-[11px] text-[#F14C4C] font-bold">
                          -
                        </div>
                        <div className="flex-1 overflow-x-auto px-2 py-0.5 font-mono text-xs leading-snug whitespace-pre">
                          <HighlightedCode text={row.left.text} />
                        </div>
                      </div>
                    )}

                    {row.right.type === "added" && (
                      <div className="flex h-6 w-full items-center border-b border-[#2A2A2B]/40 bg-[#1E3B20]/35 hover:bg-[#1E3B20]/50 border-l-2 border-[#4EC9B0]">
                        <div className="flex w-16 shrink-0 items-center justify-between border-r border-[#303031] bg-[#16301A] px-1.5 py-0.5 font-mono text-xs text-[#89D185] font-semibold select-none">
                          <span className="w-6 text-right text-transparent">
                            +
                          </span>
                          <span className="w-6 text-right">
                            {row.right.lineNum}
                          </span>
                        </div>
                        <div className="w-4 text-center font-mono text-[11px] text-[#89D185] font-bold">
                          +
                        </div>
                        <div className="flex-1 overflow-x-auto px-2 py-0.5 font-mono text-xs leading-snug whitespace-pre">
                          <HighlightedCode text={row.right.text} />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Error message banner if apply failed */}
      {errorMessage && (
        <div className="flex items-center gap-2 border-t border-[#BE1100] bg-[#5A1D1D] px-4 py-2 text-xs text-[#F14C4C] shrink-0">
          <AlertTriangleIcon size={14} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Full-Width Footer / Action Bar */}
      <footer className="flex items-center justify-between border-t border-[#303031] bg-[#181818] px-5 py-3 shrink-0 z-20">
        <div className="flex items-center gap-2 text-xs text-[#858585] leading-snug">
          <span>
            Clicking <strong className="text-[#D4D4D4]">Apply Fix</strong> will automatically update the file in your workspace.
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Cancel Button */}
          <button
            type="button"
            onClick={onClose}
            disabled={fixState === "applying"}
            className="rounded-md border border-[#3C3C3C] bg-[#2D2D2D] hover:bg-[#383838] active:bg-[#252525] px-4 py-1.5 text-xs font-medium text-[#CCCCCC] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          {/* Apply Fix Button */}
          <button
            type="button"
            onClick={handleApply}
            disabled={fixState === "applying" || fixState === "applied"}
            className={`flex items-center gap-2 rounded-md px-5 py-1.5 text-xs font-semibold shadow-md transition-all cursor-pointer ${
              fixState === "applied"
                ? "bg-[#1E3B20] text-[#89D185] border border-[#4EC9B0]/50"
                : fixState === "error"
                  ? "bg-[#5A1D1D] text-[#F14C4C] border border-[#BE1100]"
                  : "bg-[#0E639C] hover:bg-[#1177BB] active:bg-[#094771] text-white"
            } disabled:opacity-75`}
          >
            {fixState === "applying" ? (
              <>
                <RefreshCwIcon size={14} className="animate-spin text-white" />
                <span>Applying Fix…</span>
              </>
            ) : fixState === "applied" ? (
              <>
                <CheckIcon size={14} className="text-[#89D185]" />
                <span>Fix Applied!</span>
              </>
            ) : fixState === "error" ? (
              <>
                <AlertTriangleIcon size={14} className="text-[#F14C4C]" />
                <span>Retry Apply</span>
              </>
            ) : (
              <>
                <WandIcon size={14} className="text-white" />
                <span>Apply Fix</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
