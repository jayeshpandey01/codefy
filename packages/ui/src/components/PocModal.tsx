import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Finding } from "@whoami/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PlayIcon,
  RefreshCwIcon,
  TerminalIcon,
  XIcon,
} from "./Icons.js";
import { SeverityBadge } from "./SeverityBadge.js";

export interface PocModalProps {
  readonly finding: Finding;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onRunPoc: (finding: Finding) => Promise<boolean | { verified: boolean; detail?: string }>;
}

export interface PocProbeInfo {
  readonly probePayload: string;
  readonly attackType: string;
  readonly impactDescription: string;
  readonly probeTarget: string;
}

/**
 * Generate simulated probe details for PoC verification
 */
export function generatePocProbeInfo(finding: Finding): PocProbeInfo {
  const steps = finding.trace?.steps || [];
  const sourceStep = steps[0];
  const sinkStep = steps[steps.length - 1] || sourceStep;
  const targetPath = sinkStep ? `${sinkStep.filePath}:${sinkStep.line}` : "src/index.ts:1";

  if (
    finding.ruleId === "js-command-injection-exec" ||
    finding.ruleId?.includes("command-injection")
  ) {
    return {
      attackType: "OS Command Injection (CWE-78)",
      probePayload: `filename="sample.png; echo __WHOAMI_PROBE_CONFIRMED__"`,
      impactDescription:
        "Probe injects a benign delimiter into the command string to verify if arbitrary shell commands execute in the host process environment.",
      probeTarget: `${targetPath} -> ${sinkStep?.label || "exec()"}`,
    };
  }

  if (
    finding.ruleId === "js-sql-injection-string-concat" ||
    finding.ruleId?.includes("sql-injection")
  ) {
    return {
      attackType: "SQL Injection (CWE-89)",
      probePayload: `id=1' OR '1'='1' --`,
      impactDescription:
        "Probe sends boolean tautology SQL fragment to determine if query syntax is manipulated without prepared statement parameterization.",
      probeTarget: `${targetPath} -> ${sinkStep?.label || "db.query()"}`,
    };
  }

  if (
    finding.ruleId === "js-path-traversal" ||
    finding.ruleId?.includes("path-traversal")
  ) {
    return {
      attackType: "Directory / Path Traversal (CWE-22)",
      probePayload: `path=../../../../etc/passwd`,
      impactDescription:
        "Probe injects relative dot-dot-slash sequences to verify if filesystem read APIs escape boundary root restrictions.",
      probeTarget: `${targetPath} -> ${sinkStep?.label || "fs.readFileSync()"}`,
    };
  }

  if (
    finding.ruleId === "js-ssrf-unvalidated-url" ||
    finding.ruleId?.includes("ssrf")
  ) {
    return {
      attackType: "Server-Side Request Forgery (CWE-918)",
      probePayload: `url=http://169.254.169.254/latest/meta-data/`,
      impactDescription:
        "Probe tests whether backend client resolves and reaches internal cloud metadata addresses without host allowlisting.",
      probeTarget: `${targetPath} -> ${sinkStep?.label || "fetch()"}`,
    };
  }

  if (
    finding.ruleId === "js-code-injection" ||
    finding.ruleId?.includes("code-injection")
  ) {
    return {
      attackType: "Arbitrary Code Execution (CWE-94)",
      probePayload: `eval("1+1")`,
      impactDescription:
        "Probe passes dynamic JavaScript expression to verify if code evaluation occurs in application runtime.",
      probeTarget: `${targetPath} -> ${sinkStep?.label || "eval()"}`,
    };
  }

  return {
    attackType: `${finding.title} (${finding.cwe || "Security Probe"})`,
    probePayload: `${sourceStep?.label || "input"} -> ${sinkStep?.label || "sink"}`,
    impactDescription:
      "Deterministic dataflow probe verifies whether untrusted data flows from source to sink without sanitization.",
    probeTarget: targetPath,
  };
}

/**
 * Small Center Popup Modal for PoC (Proof of Concept) runtime verification.
 */
export function PocModal({
  finding,
  isOpen,
  onClose,
  onRunPoc,
}: PocModalProps): React.ReactElement | null {
  const [pocState, setPocState] = useState<
    "idle" | "running" | "verified" | "unverified" | "error"
  >("idle");
  const [probeOutput, setProbeOutput] = useState<string | null>(null);

  const probeInfo = useMemo(() => generatePocProbeInfo(finding), [finding]);

  if (!isOpen) return null;

  const handleExecutePoc = async () => {
    setPocState("running");
    setProbeOutput(null);

    try {
      const res = await onRunPoc(finding);
      let isVerified = false;
      let detailMessage = "";

      if (typeof res === "boolean") {
        isVerified = res;
      } else if (res && typeof res === "object") {
        isVerified = Boolean(res.verified);
        detailMessage = res.detail || "";
      }

      if (isVerified) {
        setPocState("verified");
        setProbeOutput(
          detailMessage ||
            `[PoC Verified] Successfully verified exploitability for ${probeInfo.attackType}. Untrusted input reaches sink without sanitizer barriers.`,
        );
      } else {
        setPocState("unverified");
        setProbeOutput(
          detailMessage ||
            "[PoC Result] Probe could not deterministically trigger execution or sanitizer neutralized payload.",
        );
      }
    } catch {
      setPocState("error");
      setProbeOutput("[PoC Error] Failed to execute probe in local runtime.");
    }
  };

  const steps = finding.trace?.steps || [];
  const sourceStep = steps[0];
  const sinkStep = steps[steps.length - 1] || sourceStep;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="poc-modal-title"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none font-sans animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && pocState !== "running") {
          onClose();
        }
      }}
    >
      <div className="flex flex-col w-[540px] max-w-[calc(100vw-32px)] max-h-[90vh] rounded-lg border border-vscode-border bg-vscode-bg text-vscode-fg shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-vscode-border bg-vscode-header px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-vscode-primary/20 border border-vscode-focus/40 text-severity-medium shrink-0">
              <TerminalIcon size={13} />
            </div>
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <SeverityBadge severity={finding.severity} />
              <h3
                id="poc-modal-title"
                className="text-xs font-semibold text-vscode-fg truncate"
              >
                PoC Verification
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={pocState === "running"}
            title="Close PoC Dialog"
            className="rounded p-1 text-vscode-muted hover:bg-vscode-card-hover hover:text-vscode-fg active:bg-vscode-card-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            <XIcon size={14} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs leading-relaxed">
          {/* Finding Title & File Context */}
          <div className="rounded border border-vscode-border bg-vscode-card p-2.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-vscode-muted mb-1">
              Target Vulnerability
            </div>
            <div className="font-semibold text-vscode-fg">{finding.title}</div>
            {sinkStep && (
              <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-vscode-link">
                <ExternalLinkIcon size={11} className="shrink-0" />
                <span>
                  {sinkStep.filePath}:{sinkStep.line}
                </span>
              </div>
            )}
          </div>

          {/* Taint Path Summary */}
          <div className="rounded border border-vscode-border bg-vscode-header p-2.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-vscode-muted mb-1.5">
              Dataflow Path
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
              <span className="rounded bg-vscode-card-selected border border-vscode-focus/40 px-1.5 py-0.2 text-severity-medium text-[10px]">
                SOURCE
              </span>
              <span className="text-vscode-fg">{sourceStep?.label || "source"}</span>
              <ChevronRightIcon size={12} className="text-vscode-muted" />
              <span className="rounded bg-[#5A1D1D] border border-[#BE1100]/50 px-1.5 py-0.2 text-severity-critical text-[10px]">
                SINK
              </span>
              <span className="text-vscode-fg">{sinkStep?.label || "sink"}</span>
            </div>
          </div>

          {/* Simulated Probe Payload */}
          <div className="rounded border border-vscode-border bg-vscode-header p-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-severity-low">
                {probeInfo.attackType}
              </span>
              <span className="text-[10px] font-mono text-vscode-muted">
                Deterministic Probe
              </span>
            </div>
            <pre className="overflow-x-auto rounded border border-vscode-header bg-vscode-header p-2 font-mono text-[11px] text-severity-low leading-normal whitespace-pre">
              <code>{probeInfo.probePayload}</code>
            </pre>
            <p className="mt-1.5 text-[11px] text-vscode-muted leading-normal">
              {probeInfo.impactDescription}
            </p>
          </div>

          {/* Probe Output / Result Box */}
          {probeOutput && (
            <div
              className={`rounded border p-2.5 transition-all ${
                pocState === "verified"
                  ? "border-[#4EC9B0]/50 bg-[#142618] text-severity-low"
                  : pocState === "unverified"
                    ? "border-severity-high/50 bg-[#2D2410] text-severity-high"
                    : "border-[#BE1100]/50 bg-[#2D1616] text-severity-critical"
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-[11px] mb-1">
                {pocState === "verified" ? (
                  <>
                    <CheckIcon size={13} className="text-severity-low" />
                    <span>PoC Verification Confirmed</span>
                  </>
                ) : pocState === "unverified" ? (
                  <>
                    <AlertTriangleIcon size={13} className="text-severity-high" />
                    <span>PoC Unverified</span>
                  </>
                ) : (
                  <>
                    <AlertTriangleIcon size={13} className="text-severity-critical" />
                    <span>Execution Error</span>
                  </>
                )}
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-vscode-fg break-words">
                {probeOutput}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-vscode-border bg-vscode-header px-4 py-2.5 shrink-0">
          <span className="text-[11px] text-vscode-muted">
            Runs deterministic non-destructive probe.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pocState === "running"}
              className="rounded-md border border-vscode-border bg-vscode-border hover:bg-vscode-border px-3 py-1.5 text-xs font-medium text-vscode-fg hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExecutePoc}
              disabled={pocState === "running"}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold shadow-md transition-all cursor-pointer ${
                pocState === "verified"
                  ? "bg-[#1E3B20] text-severity-low border border-[#4EC9B0]/50"
                  : "bg-vscode-primary hover:bg-vscode-primary-hover active:bg-vscode-primary-hover text-white"
              } disabled:opacity-75`}
            >
              {pocState === "running" ? (
                <>
                  <RefreshCwIcon size={12} className="animate-spin text-white" />
                  <span>Running PoC…</span>
                </>
              ) : pocState === "verified" ? (
                <>
                  <CheckIcon size={12} className="text-severity-low" />
                  <span>Verified!</span>
                </>
              ) : (
                <>
                  <PlayIcon size={11} className="text-white" />
                  <span>Run Local PoC</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
