import React, { useState } from "react";
import type {
  AllScanProfile,
  AuditEventRead,
  Finding,
  RemoteFindingSummary,
  SastFindingEvidence,
  SastFindingSummary,
  SastProfile,
  ScanProfile,
  ScanRead,
  ScanResultRead,
  Severity,
  SinkClass,
  StructuredErrorPayload,
  TaintStep,
  TargetRead,
} from "@whoami/types";
import { toStructuredError } from "@whoami/types";

import { ActionableErrorBanner } from "./ActionableErrorBanner.js";
import {
  ActivityIcon,
  DownloadIcon,
  PlayIcon,
  RadioIcon,
  RefreshCwIcon,
  RemoteScanIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "./Icons.js";

export interface RemoteScanPanelProps {
  onRegisterTarget?: (target: {
    value: string;
    owner: string;
    authRef: string;
  }) => Promise<TargetRead>;
  onSubmitScan?: (
    targetId: string,
    profile: AllScanProfile,
    ruleTags?: string[],
  ) => Promise<ScanRead>;
  onPollScan?: (
    scanId: string,
  ) => Promise<{ scan: ScanRead; result?: ScanResultRead }>;
  onCancelScan?: (scanId: string) => Promise<ScanRead>;
  onFetchAuditEvents?: () => Promise<AuditEventRead[]>;
  onImportFindings?: (findings: Finding[]) => void;
}

export const SAST_PROFILES: Array<{
  id: SastProfile;
  name: string;
  desc: string;
  tool: string;
}> = [
  {
    id: "sast-joern",
    name: "Joern CPG Taint Scan",
    desc: "Code Property Graph AST/CFG & inter-procedural taint flow discovery",
    tool: "Joern CPG",
  },
  {
    id: "sast-semgrep",
    name: "Semgrep AST Rules",
    desc: "High-speed semantic pattern matching across OWASP Top 10 & CWE rules",
    tool: "Semgrep",
  },
  {
    id: "sast-trufflehog",
    name: "TruffleHog Secret Scan",
    desc: "800+ credential detector scanning with live verification checks",
    tool: "TruffleHog",
  },
];

export const DAST_PROFILES: Array<{
  id: ScanProfile;
  name: string;
  desc: string;
  tool: string;
}> = [
  {
    id: "recon",
    name: "Fast Recon",
    desc: "DNS, open ports, and live HTTP probing",
    tool: "httpx + naabu",
  },
  {
    id: "web-discovery",
    name: "Web Discovery",
    desc: "Tech stack fingerprinting & endpoints",
    tool: "katana + httpx",
  },
  {
    id: "network-portscan",
    name: "Full Network Scan",
    desc: "Top 1000 TCP ports + service audit",
    tool: "nmap",
  },
  {
    id: "fast-portscan",
    name: "Fast Portscan",
    desc: "Rapid SYN scan on top 100 ports",
    tool: "naabu",
  },
  {
    id: "content-discovery",
    name: "Content Discovery",
    desc: "Directory fuzzing & exposed files",
    tool: "ffuf",
  },
  {
    id: "vuln-assessment",
    name: "Vuln Assessment",
    desc: "Targeted vulnerability templates",
    tool: "nuclei",
  },
];

export const PROFILES = [...SAST_PROFILES, ...DAST_PROFILES];

export function convertScanResultToFindings(
  result: ScanResultRead,
  targetValue: string,
): Finding[] {
  if (!result.summary?.findings) return [];

  const findings: Finding[] = [];
  const createdAt = result.created_at || new Date().toISOString();

  for (let i = 0; i < result.summary.findings.length; i += 1) {
    const raw = result.summary.findings[i]!;
    const findingId = `remote-${result.id}-${i}`;
    const rawSev = (raw.severity || "low").toLowerCase();
    const severity: Severity =
      rawSev === "critical"
        ? "critical"
        : rawSev === "high" || rawSev === "error"
          ? "high"
          : rawSev === "medium" || rawSev === "warn" || rawSev === "warning"
            ? "medium"
            : "low";

    if ("code" in raw && typeof raw.code === "string") {
      const item = raw as SastFindingSummary;
      const evidence =
        typeof item.evidence === "object" && item.evidence !== null
          ? (item.evidence as SastFindingEvidence)
          : undefined;

      const codeStr = item.code || "";
      const isTrufflehog =
        codeStr.startsWith("TRUFFLEHOG") || Boolean(evidence?.detector);
      const isJoern = codeStr.startsWith("JOERN") || Boolean(evidence?.flow);
      const hostOrPath =
        evidence?.file || evidence?.location || targetValue;
      const sinkClass: SinkClass = isTrufflehog
        ? "secret-exposure"
        : codeStr.toLowerCase().includes("sql")
          ? "sql-injection"
          : codeStr.toLowerCase().includes("command")
            ? "command-injection"
            : "ssrf";

      const cwe =
        (Array.isArray(evidence?.cwe) && evidence.cwe[0]
          ? evidence.cwe[0].match(/(CWE-\d+)/i)?.[1]?.toUpperCase()
          : undefined) ||
        (sinkClass === "sql-injection"
          ? "CWE-89"
          : sinkClass === "command-injection"
            ? "CWE-78"
            : sinkClass === "secret-exposure"
              ? "CWE-798"
              : "CWE-200");

      let traceSteps: TaintStep[] = [
        {
          filePath: hostOrPath,
          line: typeof evidence?.line === "number" ? evidence.line : 1,
          label: `Source: ${hostOrPath}`,
          role: "source" as const,
        },
        {
          filePath: hostOrPath,
          line: typeof evidence?.line === "number" ? evidence.line : 1,
          label: `${item.title} (${codeStr})`,
          role: "sink" as const,
        },
      ];

      if (isJoern && evidence?.flow && evidence.flow.length > 0) {
        traceSteps = evidence.flow.map((step, idx) => ({
          filePath: hostOrPath,
          line: typeof evidence.line === "number" ? evidence.line : 1,
          label: `${step.variable ? step.variable + ": " : ""}${step.type}`,
          role:
            idx === 0
              ? ("source" as const)
              : idx === evidence.flow!.length - 1
                ? ("sink" as const)
                : ("sanitizer" as const),
        }));
      }

      findings.push({
        id: findingId,
        ruleId: `remote-${codeStr.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        scope: isTrufflehog ? "secrets" : "orchestrator",
        code: codeStr,
        title: item.title,
        description: item.description,
        severity,
        status: "confirmed",
        cwe,
        hint: item.remediation,
        fix: item.remediation,
        trace: {
          sinkClass,
          steps: traceSteps,
        },
        createdAt,
      });
    } else {
      const item = raw as RemoteFindingSummary;
      const hostOrPath = item.matched_at || item.host || targetValue;
      const ruleSlug = (item.template_id || item.title || "generic")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const cwe = item.cwe || "CWE-699";
      const sinkClass: SinkClass = "command-injection";

      const traceSteps: TaintStep[] = [
        {
          filePath: `https://${targetValue}`,
          line: 1,
          label: `Probe Target: ${targetValue}`,
          role: "source" as const,
        },
        {
          filePath: hostOrPath,
          line: 1,
          label: `${item.title} (${item.template_id || "vulnerability"})`,
          role: "sink" as const,
        },
      ];

      findings.push({
        id: findingId,
        ruleId: `remote-${ruleSlug}`,
        scope: "orchestrator",
        code: item.template_id || "remote_vuln",
        title: item.title,
        description:
          item.description ||
          `Dynamic scan finding identified by ${item.template_id || "remote orchestrator"} at ${hostOrPath}.`,
        severity,
        status: "confirmed",
        cwe,
        trace: {
          sinkClass,
          steps: traceSteps,
        },
        createdAt,
      });
    }
  }

  return findings;
}

export function RemoteScanPanel({
  onRegisterTarget,
  onSubmitScan,
  onPollScan,
  onCancelScan,
  onFetchAuditEvents,
  onImportFindings,
}: RemoteScanPanelProps): React.ReactElement {
  const [targetValue, setTargetValue] = useState("example.com");
  const [ownerRef, setOwnerRef] = useState("Security Ops <secops@example.com>");
  const [authRef, setAuthRef] = useState("AUTH-SEC-2026");
  const [scanCategory, setScanCategory] = useState<"sast" | "dast">("sast");
  const [selectedProfile, setSelectedProfile] =
    useState<AllScanProfile>("sast-joern");
  const [ruleTags, setRuleTags] = useState("");

  const [activeTarget, setActiveTarget] = useState<TargetRead | null>(null);
  const [activeScan, setActiveScan] = useState<ScanRead | null>(null);
  const [scanResult, setScanResult] = useState<ScanResultRead | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEventRead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<
    StructuredErrorPayload | string | null
  >(null);
  const [activeTab, setActiveTab] = useState<"scanner" | "audit">("scanner");

  const handleRegisterAndScan = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setScanResult(null);
    setImportedCount(null);

    try {
      let target = activeTarget;
      if (!target || target.value !== targetValue) {
        if (onRegisterTarget) {
          target = await onRegisterTarget({
            value: targetValue.trim(),
            owner: ownerRef.trim(),
            authRef: authRef.trim(),
          });
          setActiveTarget(target);
        } else {
          target = {
            id: `tgt-${Date.now()}`,
            value: targetValue.trim(),
            created_at: new Date().toISOString(),
          };
          setActiveTarget(target);
        }
      }

      if (!target?.id) {
        throw new Error("Failed to obtain target ID for scan submission");
      }

      const tags = ruleTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let scan: ScanRead;
      if (onSubmitScan) {
        scan = await onSubmitScan(
          target.id,
          selectedProfile,
          tags.length > 0 ? tags : undefined,
        );
      } else {
        scan = {
          id: `scan-${Date.now()}`,
          target_id: target.id,
          profile: selectedProfile,
          status: "running",
          controller_job_id: null,
          failure_reason: null,
          created_at: new Date().toISOString(),
        };
      }
      setActiveScan(scan);

      if (onPollScan) {
        let attempts = 0;
        const maxAttempts = 30;
        const pollInterval = setInterval(async () => {
          attempts += 1;
          try {
            const { scan: updatedScan, result } = await onPollScan(scan.id);
            setActiveScan(updatedScan);

            if (result) {
              setScanResult(result);
            }

            if (
              updatedScan.status === "completed" ||
              updatedScan.status === "failed" ||
              updatedScan.status === "cancelled"
            ) {
              clearInterval(pollInterval);
              setIsLoading(false);
            } else if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              setIsLoading(false);
            }
          } catch (pollErr: unknown) {
            clearInterval(pollInterval);
            setIsLoading(false);
            setErrorMsg(toStructuredError(pollErr, "orchestrator"));
          }
        }, 2000);
      } else {
        setIsLoading(false);
      }
    } catch (err: unknown) {
      setIsLoading(false);
      setErrorMsg(toStructuredError(err, "orchestrator"));
    }
  };

  const handleCancel = async () => {
    if (!activeScan || !onCancelScan) return;
    try {
      const cancelled = await onCancelScan(activeScan.id);
      setActiveScan(cancelled);
    } catch (err: unknown) {
      setErrorMsg(toStructuredError(err, "orchestrator"));
    }
  };

  const handleLoadAudit = async () => {
    setActiveTab("audit");
    if (!onFetchAuditEvents) return;
    try {
      const events = await onFetchAuditEvents();
      setAuditEvents(events);
    } catch (err: unknown) {
      setErrorMsg(toStructuredError(err, "orchestrator"));
    }
  };

  const handleImportToWorkspace = () => {
    if (!scanResult || !onImportFindings) return;
    const findings = convertScanResultToFindings(scanResult, targetValue);
    onImportFindings(findings);
    setImportedCount(findings.length);
  };

  const activeProfiles =
    scanCategory === "sast" ? SAST_PROFILES : DAST_PROFILES;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#1E1E1E] p-4 text-[#D4D4D4] font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#303031] pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-[#0E639C]/20 border border-[#007ACC]/40 text-[#75BEFF]">
            <RemoteScanIcon size={16} />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-tight text-[#D4D4D4]">
              Authorized Scan Orchestrator
            </h2>
            <p className="text-[11px] text-[#858585]">
              Targeted dynamic security scanning and cloud vulnerability
              discovery
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center rounded-md border border-[#303031] bg-[#252526] p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "scanner"
                ? "bg-[#0E639C] text-white shadow-sm font-semibold"
                : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E] active:bg-[#323233]"
            }`}
          >
            <RadioIcon size={13} />
            <span>Scanner</span>
          </button>
          <button
            type="button"
            onClick={handleLoadAudit}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "audit"
                ? "bg-[#0E639C] text-white shadow-sm font-semibold"
                : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E] active:bg-[#323233]"
            }`}
          >
            <ActivityIcon size={13} />
            <span>Audit Trail</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <ActionableErrorBanner
          error={errorMsg}
          onDismiss={() => setErrorMsg(null)}
          onRetry={handleRegisterAndScan}
          className="mt-3"
        />
      )}

      {activeTab === "scanner" ? (
        <div className="mt-4 flex flex-col gap-4">
          {/* Target inputs */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                Target Domain / Host
              </label>
              <input
                type="text"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="example.com"
                className="mt-1 w-full rounded border border-[#3C3C3C] bg-[#3C3C3C] px-2.5 py-1.5 text-xs text-[#D4D4D4] placeholder-[#A6A6A6] focus:border-[#007ACC] focus:ring-1 focus:ring-[#007ACC] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                Owner Reference
              </label>
              <input
                type="text"
                value={ownerRef}
                onChange={(e) => setOwnerRef(e.target.value)}
                placeholder="Security Team <secops@example.com>"
                className="mt-1 w-full rounded border border-[#3C3C3C] bg-[#3C3C3C] px-2.5 py-1.5 text-xs text-[#D4D4D4] placeholder-[#A6A6A6] focus:border-[#007ACC] focus:ring-1 focus:ring-[#007ACC] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                Authorization Ticket
              </label>
              <input
                type="text"
                value={authRef}
                onChange={(e) => setAuthRef(e.target.value)}
                placeholder="SEC-AUTH-2026"
                className="mt-1 w-full rounded border border-[#3C3C3C] bg-[#3C3C3C] px-2.5 py-1.5 text-xs text-[#D4D4D4] placeholder-[#A6A6A6] focus:border-[#007ACC] focus:ring-1 focus:ring-[#007ACC] focus:outline-none"
              />
            </div>
          </div>

          {/* Scan Category and Profile Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                Scan Profile & Engine
              </label>
              <div className="flex items-center rounded border border-[#303031] bg-[#1E1E1E] p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setScanCategory("sast");
                    setSelectedProfile("sast-joern");
                  }}
                  className={`rounded px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                    scanCategory === "sast"
                      ? "bg-[#0E639C] text-white font-semibold"
                      : "text-[#858585] hover:text-[#D4D4D4]"
                  }`}
                >
                  Code & Secrets (SAST)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScanCategory("dast");
                    setSelectedProfile("recon");
                  }}
                  className={`rounded px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                    scanCategory === "dast"
                      ? "bg-[#0E639C] text-white font-semibold"
                      : "text-[#858585] hover:text-[#D4D4D4]"
                  }`}
                >
                  Network & Web (DAST)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {activeProfiles.map((p) => {
                const isSelected = selectedProfile === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProfile(p.id)}
                    className={`flex flex-col items-start rounded border p-2.5 text-left transition ${
                      isSelected
                        ? "border-[#007ACC] bg-[#094771] text-white shadow-sm ring-1 ring-[#007ACC]"
                        : "border-[#303031] bg-[#252526] text-[#CCCCCC] hover:border-[#3C3C3C] hover:bg-[#2A2D2E]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-xs font-semibold">{p.name}</span>
                      <span className="rounded bg-[#1E1E1E] border border-[#303031] px-1.5 py-0.2 text-[10px] font-mono text-[#89D185]">
                        {p.tool}
                      </span>
                    </div>
                    <span className="mt-1 text-[11px] leading-tight text-[#858585]">
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {scanCategory === "sast" && (
              <div className="mt-2.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#858585]">
                  Rule Tags (Optional, comma-separated e.g. sqli, rce, owasp, cwe)
                </label>
                <input
                  type="text"
                  value={ruleTags}
                  onChange={(e) => setRuleTags(e.target.value)}
                  placeholder="sqli, rce, owasp"
                  className="mt-1 w-full rounded border border-[#3C3C3C] bg-[#3C3C3C] px-2.5 py-1.5 text-xs text-[#D4D4D4] placeholder-[#A6A6A6] focus:border-[#007ACC] focus:ring-1 focus:ring-[#007ACC] focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Action Trigger */}
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleRegisterAndScan}
              disabled={isLoading || !targetValue.trim()}
              className="flex items-center gap-1.5 rounded bg-[#0E639C] hover:bg-[#1177BB] px-4 py-1.5 text-xs font-semibold text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCwIcon
                    size={14}
                    className="animate-spin text-white"
                  />
                  <span>Scanning Target…</span>
                </>
              ) : (
                <>
                  <PlayIcon size={12} className="text-white" />
                  <span>Launch Authorized Scan</span>
                </>
              )}
            </button>

            {activeScan && activeScan.status === "running" && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1 rounded border border-[#BE1100] bg-[#5A1D1D] hover:bg-[#6E2424] px-3 py-1.5 text-xs font-semibold text-[#F14C4C] transition cursor-pointer"
              >
                <XCircleIcon size={13} />
                <span>Cancel Scan</span>
              </button>
            )}
          </div>

          {/* Status & Results Display */}
          {activeScan && (
            <div className="mt-2 rounded border border-[#303031] bg-[#252526] p-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-[#303031] pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon size={14} className="text-[#75BEFF]" />
                  <span className="text-xs font-semibold text-[#D4D4D4]">
                    Scan Job: {activeScan.id}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    activeScan.status === "completed"
                      ? "border-[#4EC9B0]/50 bg-[#1E3B20] text-[#89D185]"
                      : activeScan.status === "running"
                        ? "border-[#007ACC]/50 bg-[#04395E] text-[#75BEFF] animate-pulse"
                        : activeScan.status === "failed"
                          ? "border-[#BE1100] bg-[#5A1D1D] text-[#F14C4C]"
                          : "border-[#CCA700]/50 bg-[#382C00] text-[#CCA700]"
                  }`}
                >
                  {activeScan.status}
                </span>
              </div>

              {scanResult && scanResult.summary && (
                <div className="mt-3 flex flex-col gap-3">
                  {/* Risk Breakdown Chips & Import Action */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#303031] pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-[#858585]">
                        Findings:
                      </span>
                      <span className="rounded border border-[#BE1100] bg-[#5A1D1D] px-1.5 py-0.2 text-[11px] font-semibold text-[#F14C4C]">
                        {scanResult.summary.risk_summary?.critical || 0}{" "}
                        Critical
                      </span>
                      <span className="rounded border border-[#CCA700]/50 bg-[#382C00] px-1.5 py-0.2 text-[11px] font-semibold text-[#CCA700]">
                        {scanResult.summary.risk_summary?.high || 0} High
                      </span>
                      <span className="rounded border border-[#007ACC]/50 bg-[#04395E] px-1.5 py-0.2 text-[11px] font-semibold text-[#75BEFF]">
                        {scanResult.summary.risk_summary?.medium || 0} Medium
                      </span>
                      <span className="rounded border border-[#3C3C3C] bg-[#3A3D41] px-1.5 py-0.2 text-[11px] font-semibold text-[#858585]">
                        {scanResult.summary.risk_summary?.info || 0} Info
                      </span>
                    </div>

                    {onImportFindings && (
                      <button
                        type="button"
                        onClick={handleImportToWorkspace}
                        className="flex items-center gap-1.5 rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-2.5 py-1 text-xs font-medium text-[#D4D4D4] transition shadow-sm cursor-pointer"
                      >
                        <DownloadIcon size={13} className="text-[#75BEFF]" />
                        <span>
                          {importedCount !== null
                            ? `Imported (${importedCount})`
                            : "Import to Findings & Graph"}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Findings Table */}
                  {scanResult.summary.findings &&
                    scanResult.summary.findings.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <h4 className="text-xs font-semibold text-[#D4D4D4]">
                          Discovered Vulnerabilities:
                        </h4>
                        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                          {scanResult.summary.findings.map((f, idx) => (
                            <div
                              key={idx}
                              className="flex items-start justify-between rounded border border-[#303031] bg-[#1E1E1E] p-2 text-xs hover:border-[#3C3C3C] transition"
                            >
                              <div>
                                <div className="font-semibold text-[#D4D4D4]">
                                  {f.title}
                                </div>
                                {f.description && (
                                  <div className="text-[11px] text-[#858585] mt-0.5">
                                    {f.description}
                                  </div>
                                )}
                              </div>
                              <span
                                className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider shrink-0 ml-2 ${
                                  f.severity === "critical"
                                    ? "border-[#BE1100] bg-[#5A1D1D] text-[#F14C4C]"
                                    : f.severity === "high"
                                      ? "border-[#CCA700]/50 bg-[#382C00] text-[#CCA700]"
                                      : "border-[#007ACC]/50 bg-[#04395E] text-[#75BEFF]"
                                }`}
                              >
                                {f.severity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Audit Log View */
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#303031] pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#858585]">
              Recent Audit Trail
            </h3>
            <span className="text-[11px] text-[#5A5A5A]">
              {auditEvents.length} events loaded
            </span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto font-mono text-[11px]">
            {auditEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between rounded border border-[#303031] bg-[#252526] px-3 py-1.5 text-[#D4D4D4]"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#89D185]">
                    {evt.action}
                  </span>
                  <span className="text-[#858585]">[{evt.resource_type}]</span>
                </div>
                <span className="text-[10px] text-[#858585]">
                  {evt.resource_id}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
