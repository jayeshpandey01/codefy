import React, { useState } from "react";
import type { Finding } from "@whoami/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  InfoIcon,
  PlayIcon,
  RefreshCwIcon,
  WandIcon,
  XIcon,
} from "./Icons.js";
import { SeverityBadge } from "./SeverityBadge.js";
import { DiffPreviewModal } from "./DiffPreviewModal.js";
import { PocModal } from "./PocModal.js";

export interface FloatingDetailCardProps {
  readonly finding: Finding;
  readonly onClose?: () => void;
  readonly onApplyFix?: (finding: Finding) => Promise<boolean | void> | void;
  readonly onRunPoc?: (finding: Finding) => Promise<boolean>;
  readonly onJumpToLine?: (filePath: string, line: number) => void;
}

type CardTab = "flow" | "remediation" | "rule";

export function FloatingDetailCard({
  finding,
  onClose,
  onApplyFix,
  onRunPoc,
  onJumpToLine,
}: FloatingDetailCardProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<CardTab>("flow");
  const [copiedFix, setCopiedFix] = useState(false);
  const [copiedRule, setCopiedRule] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isPocModalOpen, setIsPocModalOpen] = useState(false);
  const [pocState, setPocState] = useState<
    "idle" | "running" | "verified" | "unverified"
  >("idle");
  const [fixState, setFixState] = useState<
    "idle" | "applying" | "applied" | "error"
  >("idle");

  const steps = finding.trace.steps;
  const entryStep = steps[0];
  const sinkStep = steps[steps.length - 1];
  const jumpTarget = sinkStep ?? entryStep;

  const handleApplyFix = async () => {
    if (!onApplyFix) return;
    setFixState("applying");
    try {
      const res = await onApplyFix(finding);
      if (res === false) {
        setFixState("error");
        return false;
      } else {
        setFixState("applied");
        setTimeout(() => setFixState("idle"), 3000);
        return true;
      }
    } catch {
      setFixState("error");
      throw new Error("Failed to apply fix");
    }
  };

  const handleRunPoc = async () => {
    if (!onRunPoc) return;
    setPocState("running");
    try {
      const verified = await onRunPoc(finding);
      setPocState(verified ? "verified" : "unverified");
    } catch {
      setPocState("unverified");
    }
  };

  const handleCopyFix = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!finding.fix) return;
    void navigator.clipboard.writeText(finding.fix);
    setCopiedFix(true);
    setTimeout(() => setCopiedFix(false), 2000);
  };

  const handleCopyRule = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!finding.ruleYaml) return;
    void navigator.clipboard.writeText(finding.ruleYaml);
    setCopiedRule(true);
    setTimeout(() => setCopiedRule(false), 2000);
  };

  const scopeBadge = finding.scope || "security";
  const codeBadge = finding.code || finding.ruleId;

  return (
    <div
      role="region"
      aria-label="Finding Details"
      className="absolute top-3 left-3 z-20 w-[440px] max-w-[calc(100vw-40px)] rounded-lg border border-vscode-border bg-vscode-bg p-4 text-vscode-fg shadow-2xl select-none transition-all font-sans"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 border-b border-vscode-border pb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SeverityBadge severity={finding.severity} />
          <span className="rounded border border-vscode-focus/40 bg-vscode-card-selected/50 px-1.5 py-0.5 text-[10px] font-mono text-severity-medium">
            [{scopeBadge}:{codeBadge}]
          </span>
          {finding.cwe && (
            <span className="rounded border border-vscode-border bg-vscode-card px-1.5 py-0.5 text-[10px] font-mono text-vscode-fg">
              {finding.cwe}
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close Details Card"
            className="rounded-md p-1 text-vscode-muted hover:bg-vscode-card-hover hover:text-vscode-fg active:bg-vscode-card-hover transition-all duration-150 cursor-pointer"
          >
            <XIcon size={13} />
          </button>
        )}
      </div>

      {/* Title & File Link */}
      <div className="mt-2.5">
        <h3 className="text-xs font-semibold text-vscode-fg leading-snug break-words">
          {finding.title}
        </h3>
        {jumpTarget && (
          <button
            type="button"
            onClick={() => onJumpToLine?.(jumpTarget.filePath, jumpTarget.line)}
            className="mt-1 flex items-start gap-1 font-mono text-[11px] text-vscode-link hover:underline cursor-pointer text-left break-all"
          >
            <ExternalLinkIcon size={12} className="shrink-0 mt-0.5" />
            <span>
              {jumpTarget.filePath}:{jumpTarget.line}
            </span>
          </button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="mt-3 flex items-center border-b border-vscode-border text-[11px] font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("flow")}
          className={`px-3 py-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "flow"
              ? "border-vscode-focus text-white font-semibold"
              : "border-transparent text-vscode-muted hover:text-vscode-fg"
          }`}
        >
          Data Flow ({steps.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("remediation")}
          className={`px-3 py-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "remediation"
              ? "border-vscode-focus text-white font-semibold"
              : "border-transparent text-vscode-muted hover:text-vscode-fg"
          }`}
        >
          Remediation & Fix
        </button>
        {finding.ruleYaml && (
          <button
            type="button"
            onClick={() => setActiveTab("rule")}
            className={`px-3 py-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === "rule"
                ? "border-vscode-focus text-white font-semibold"
                : "border-transparent text-vscode-muted hover:text-vscode-fg"
            }`}
          >
            AST Rule (YAML)
          </button>
        )}
      </div>

      {/* TAB 1: Taint Flow & Visual Breadcrumbs */}
      {activeTab === "flow" && (
        <div className="mt-2.5 flex flex-col gap-2">
          {steps.length > 0 ? (
            <div className="rounded border border-vscode-border bg-vscode-header p-2.5 text-[11px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-vscode-muted mb-2">
                Taint Propagation Path
              </div>
              <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0 mt-0.5 ${
                        step.role === "source"
                          ? "bg-vscode-card-selected text-severity-medium border border-vscode-focus/40"
                          : step.role === "sink"
                            ? "bg-[#5A1D1D] text-severity-critical border border-[#BE1100]"
                            : "bg-[#1E3B20] text-severity-low border border-[#4EC9B0]/40"
                      }`}
                    >
                      {step.role}
                    </span>
                    <span className="text-vscode-fg leading-tight break-words flex-1">
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 text-xs text-vscode-muted">
              No propagation steps recorded for this single-node event.
            </div>
          )}

          {finding.description && (
            <p className="text-xs text-[#999999] leading-relaxed break-words max-h-28 overflow-y-auto pr-1">
              {finding.description}
            </p>
          )}
        </div>
      )}

      {/* TAB 2: Vercel-Style Actionable Remediation Panel */}
      {activeTab === "remediation" && (
        <div className="mt-2.5 flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
          {/* Reason Box */}
          {finding.reason && (
            <div className="rounded-md border border-severity-critical/20 bg-[#2D1616] p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-severity-critical mb-1 text-[11px] uppercase tracking-wider">
                <AlertTriangleIcon size={12} />
                <span>Root Cause & Risk</span>
              </div>
              <p className="text-vscode-fg leading-relaxed break-words">
                {finding.reason}
              </p>
            </div>
          )}

          {/* Actionable Hint Box */}
          {finding.hint && (
            <div className="rounded-md border border-vscode-focus/30 bg-[#09233B] p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-severity-medium mb-1 text-[11px] uppercase tracking-wider">
                <InfoIcon size={12} />
                <span>Actionable Guidance</span>
              </div>
              <p className="text-vscode-fg leading-relaxed break-words">
                {finding.hint}
              </p>
            </div>
          )}

          {/* Suggested Code Fix */}
          {finding.fix && (
            <div className="rounded-md border border-[#2A2A2A] bg-vscode-header p-2.5 text-xs shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-severity-low" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-severity-low">
                    Suggested Fix
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyFix}
                  className="flex items-center gap-1 rounded border border-vscode-btn-secondary bg-vscode-card hover:bg-vscode-card-hover text-vscode-fg hover:text-vscode-fg px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
                >
                  {copiedFix ? (
                    <>
                      <CheckIcon size={11} className="text-severity-low" />
                      <span className="text-severity-low">Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={11} />
                      <span>Copy Fix</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded border border-vscode-header bg-vscode-header p-2.5 font-mono text-[11px] text-severity-low leading-relaxed shadow-inner">
                <code
                  style={{
                    background: "transparent",
                    backgroundColor: "transparent",
                    padding: 0,
                    boxShadow: "none",
                  }}
                  className="!bg-transparent !p-0 font-mono text-severity-low block whitespace-pre"
                >
                  {finding.fix}
                </code>
              </pre>
            </div>
          )}

          {/* Docs / Reference Link */}
          {finding.link && (
            <div className="pt-1">
              <a
                href={finding.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-vscode-link hover:underline"
              >
                <ExternalLinkIcon size={12} />
                <span>Learn more in security advisory & documentation</span>
              </a>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AST Rule Definition in String/YAML form */}
      {activeTab === "rule" && finding.ruleYaml && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
              Rule ID: {finding.ruleId}
            </span>
            <button
              type="button"
              onClick={handleCopyRule}
              className="flex items-center gap-1 rounded border border-vscode-btn-secondary bg-vscode-card hover:bg-vscode-card-hover text-vscode-fg hover:text-vscode-fg px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
            >
              {copiedRule ? (
                <>
                  <CheckIcon size={11} className="text-severity-low" />
                  <span>Copied YAML</span>
                </>
              ) : (
                <>
                  <CopyIcon size={11} />
                  <span>Copy Rule YAML</span>
                </>
              )}
            </button>
          </div>
          <pre className="max-h-64 overflow-y-auto overflow-x-auto rounded border border-vscode-header bg-vscode-header p-2.5 font-mono text-[11px] text-severity-medium leading-relaxed shadow-inner">
            <code
              style={{
                background: "transparent",
                backgroundColor: "transparent",
                padding: 0,
                boxShadow: "none",
              }}
              className="!bg-transparent !p-0 font-mono text-severity-medium block whitespace-pre"
            >
              {finding.ruleYaml}
            </code>
          </pre>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3.5 flex items-center gap-2 border-t border-vscode-border pt-2.5">
        {onApplyFix && (
          <button
            type="button"
            onClick={() => setIsDiffModalOpen(true)}
            disabled={fixState === "applying"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-vscode-border bg-vscode-btn-secondary hover:bg-vscode-btn-secondary-hover active:bg-vscode-card-hover hover:text-white px-2.5 py-1.5 text-xs font-medium text-vscode-fg transition-all duration-150 shadow-sm cursor-pointer disabled:opacity-50"
          >
            {fixState === "applying" ? (
              <>
                <RefreshCwIcon
                  size={12}
                  className="animate-spin text-severity-medium"
                />
                <span>Applying Fix…</span>
              </>
            ) : fixState === "applied" ? (
              <>
                <CheckIcon size={12} className="text-severity-low" />
                <span className="text-severity-low font-semibold">Applied!</span>
              </>
            ) : fixState === "error" ? (
              <>
                <AlertTriangleIcon size={12} className="text-severity-critical" />
                <span className="text-severity-critical">Failed</span>
              </>
            ) : (
              <>
                <WandIcon size={12} className="text-severity-medium" />
                <span>Apply Fix</span>
              </>
            )}
          </button>
        )}
        {onRunPoc && (
          <button
            type="button"
            onClick={() => setIsPocModalOpen(true)}
            disabled={pocState === "running"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-vscode-border bg-vscode-btn-secondary hover:bg-vscode-btn-secondary-hover active:bg-vscode-card-hover hover:text-white px-2.5 py-1.5 text-xs font-medium text-vscode-fg disabled:opacity-50 transition-all duration-150 shadow-sm cursor-pointer"
          >
            {pocState === "running" ? (
              <>
                <RefreshCwIcon
                  size={12}
                  className="animate-spin text-severity-medium"
                />
                <span>Running PoC…</span>
              </>
            ) : pocState === "verified" ? (
              <>
                <CheckIcon size={12} className="text-severity-low" />
                <span className="text-severity-low font-semibold">PoC Verified</span>
              </>
            ) : pocState === "unverified" ? (
              <>
                <AlertTriangleIcon size={12} className="text-severity-high" />
                <span className="text-severity-high">Unverified</span>
              </>
            ) : (
              <>
                <PlayIcon size={11} className="text-severity-low" />
                <span>Run PoC</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Diff Preview Confirmation Modal */}
      {isDiffModalOpen && (
        <DiffPreviewModal
          finding={finding}
          isOpen={isDiffModalOpen}
          onClose={() => setIsDiffModalOpen(false)}
          onApplyFix={handleApplyFix}
        />
      )}

      {/* PoC Runtime Verification Modal */}
      {isPocModalOpen && onRunPoc && (
        <PocModal
          finding={finding}
          isOpen={isPocModalOpen}
          onClose={() => setIsPocModalOpen(false)}
          onRunPoc={async (f) => {
            const verified = await onRunPoc(f);
            setPocState(verified ? "verified" : "unverified");
            return verified;
          }}
        />
      )}
    </div>
  );
}
