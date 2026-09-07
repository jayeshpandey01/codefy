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
      className="absolute top-3 left-3 z-20 w-[440px] max-w-[calc(100vw-40px)] rounded-lg border border-[#3C3C3C] bg-[#1E1E1E]/98 p-4 text-[#D4D4D4] shadow-2xl backdrop-blur-md select-none transition-all font-sans"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-2 border-b border-[#303031] pb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <SeverityBadge severity={finding.severity} />
          <span className="rounded border border-[#007ACC]/40 bg-[#04395E]/50 px-1.5 py-0.5 text-[10px] font-mono text-[#75BEFF]">
            [{scopeBadge}:{codeBadge}]
          </span>
          {finding.cwe && (
            <span className="rounded border border-[#3C3C3C] bg-[#252526] px-1.5 py-0.5 text-[10px] font-mono text-[#CCCCCC]">
              {finding.cwe}
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            title="Close Details Card"
            className="rounded-md p-1 text-[#858585] hover:bg-[#2A2D2E] hover:text-white active:bg-[#323233] transition-all duration-150 cursor-pointer"
          >
            <XIcon size={13} />
          </button>
        )}
      </div>

      {/* Title & File Link */}
      <div className="mt-2.5">
        <h3 className="text-xs font-semibold text-[#D4D4D4] leading-snug break-words">
          {finding.title}
        </h3>
        {jumpTarget && (
          <button
            type="button"
            onClick={() => onJumpToLine?.(jumpTarget.filePath, jumpTarget.line)}
            className="mt-1 flex items-start gap-1 font-mono text-[11px] text-[#3794FF] hover:underline cursor-pointer text-left break-all"
          >
            <ExternalLinkIcon size={12} className="shrink-0 mt-0.5" />
            <span>
              {jumpTarget.filePath}:{jumpTarget.line}
            </span>
          </button>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="mt-3 flex items-center border-b border-[#303031] text-[11px] font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("flow")}
          className={`px-3 py-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "flow"
              ? "border-[#007ACC] text-white font-semibold"
              : "border-transparent text-[#858585] hover:text-[#CCCCCC]"
          }`}
        >
          Data Flow ({steps.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("remediation")}
          className={`px-3 py-1.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === "remediation"
              ? "border-[#007ACC] text-white font-semibold"
              : "border-transparent text-[#858585] hover:text-[#CCCCCC]"
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
                ? "border-[#007ACC] text-white font-semibold"
                : "border-transparent text-[#858585] hover:text-[#CCCCCC]"
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
            <div className="rounded border border-[#303031] bg-[#181818] p-2.5 text-[11px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#858585] mb-2">
                Taint Propagation Path
              </div>
              <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0 mt-0.5 ${
                        step.role === "source"
                          ? "bg-[#04395E] text-[#75BEFF] border border-[#007ACC]/40"
                          : step.role === "sink"
                            ? "bg-[#5A1D1D] text-[#F14C4C] border border-[#BE1100]"
                            : "bg-[#1E3B20] text-[#89D185] border border-[#4EC9B0]/40"
                      }`}
                    >
                      {step.role}
                    </span>
                    <span className="text-[#D4D4D4] leading-tight break-words flex-1">
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 text-xs text-[#858585]">
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
            <div className="rounded-md border border-[#F14C4C]/20 bg-[#2D1616] p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#F14C4C] mb-1 text-[11px] uppercase tracking-wider">
                <AlertTriangleIcon size={12} />
                <span>Root Cause & Risk</span>
              </div>
              <p className="text-[#E0E0E0] leading-relaxed break-words">
                {finding.reason}
              </p>
            </div>
          )}

          {/* Actionable Hint Box */}
          {finding.hint && (
            <div className="rounded-md border border-[#007ACC]/30 bg-[#09233B] p-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[#75BEFF] mb-1 text-[11px] uppercase tracking-wider">
                <InfoIcon size={12} />
                <span>Actionable Guidance</span>
              </div>
              <p className="text-[#D4D4D4] leading-relaxed break-words">
                {finding.hint}
              </p>
            </div>
          )}

          {/* Suggested Code Fix */}
          {finding.fix && (
            <div className="rounded-md border border-[#2A2A2A] bg-[#141414] p-2.5 text-xs shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#89D185]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#89D185]">
                    Suggested Fix
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyFix}
                  className="flex items-center gap-1 rounded border border-[#3A3D41] bg-[#252526] hover:bg-[#2F3233] text-[#CCCCCC] hover:text-white px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
                >
                  {copiedFix ? (
                    <>
                      <CheckIcon size={11} className="text-[#89D185]" />
                      <span className="text-[#89D185]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={11} />
                      <span>Copy Fix</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto rounded border border-[#222222] bg-[#0A0A0A] p-2.5 font-mono text-[11px] text-[#89D185] leading-relaxed shadow-inner">
                <code
                  style={{
                    background: "transparent",
                    backgroundColor: "transparent",
                    padding: 0,
                    boxShadow: "none",
                  }}
                  className="!bg-transparent !p-0 font-mono text-[#89D185] block whitespace-pre"
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
                className="inline-flex items-center gap-1.5 text-xs text-[#3794FF] hover:underline"
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
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#858585]">
              Rule ID: {finding.ruleId}
            </span>
            <button
              type="button"
              onClick={handleCopyRule}
              className="flex items-center gap-1 rounded border border-[#3A3D41] bg-[#252526] hover:bg-[#2F3233] text-[#CCCCCC] hover:text-white px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer"
            >
              {copiedRule ? (
                <>
                  <CheckIcon size={11} className="text-[#89D185]" />
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
          <pre className="max-h-64 overflow-y-auto overflow-x-auto rounded border border-[#222222] bg-[#0A0A0A] p-2.5 font-mono text-[11px] text-[#75BEFF] leading-relaxed shadow-inner">
            <code
              style={{
                background: "transparent",
                backgroundColor: "transparent",
                padding: 0,
                boxShadow: "none",
              }}
              className="!bg-transparent !p-0 font-mono text-[#75BEFF] block whitespace-pre"
            >
              {finding.ruleYaml}
            </code>
          </pre>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3.5 flex items-center gap-2 border-t border-[#303031] pt-2.5">
        {onApplyFix && (
          <button
            type="button"
            onClick={() => setIsDiffModalOpen(true)}
            disabled={fixState === "applying"}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] active:bg-[#323538] hover:text-white px-2.5 py-1.5 text-xs font-medium text-[#D4D4D4] transition-all duration-150 shadow-sm cursor-pointer disabled:opacity-50"
          >
            {fixState === "applying" ? (
              <>
                <RefreshCwIcon
                  size={12}
                  className="animate-spin text-[#75BEFF]"
                />
                <span>Applying Fix…</span>
              </>
            ) : fixState === "applied" ? (
              <>
                <CheckIcon size={12} className="text-[#89D185]" />
                <span className="text-[#89D185] font-semibold">Applied!</span>
              </>
            ) : fixState === "error" ? (
              <>
                <AlertTriangleIcon size={12} className="text-[#F14C4C]" />
                <span className="text-[#F14C4C]">Failed</span>
              </>
            ) : (
              <>
                <WandIcon size={12} className="text-[#75BEFF]" />
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] active:bg-[#323538] hover:text-white px-2.5 py-1.5 text-xs font-medium text-[#D4D4D4] disabled:opacity-50 transition-all duration-150 shadow-sm cursor-pointer"
          >
            {pocState === "running" ? (
              <>
                <RefreshCwIcon
                  size={12}
                  className="animate-spin text-[#75BEFF]"
                />
                <span>Running PoC…</span>
              </>
            ) : pocState === "verified" ? (
              <>
                <CheckIcon size={12} className="text-[#89D185]" />
                <span className="text-[#89D185] font-semibold">PoC Verified</span>
              </>
            ) : pocState === "unverified" ? (
              <>
                <AlertTriangleIcon size={12} className="text-[#CCA700]" />
                <span className="text-[#CCA700]">Unverified</span>
              </>
            ) : (
              <>
                <PlayIcon size={11} className="text-[#89D185]" />
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
