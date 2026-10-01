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
import { deduplicateFindings, toStructuredError } from "@whoami/types";

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
  {
    id: "sast-codeql",
    name: "CodeQL Deep Taint",
    desc: "Semantic AST analysis and inter-procedural dataflow query bundles",
    tool: "GitHub CodeQL",
  },
  {
    id: "sast-gitleaks",
    name: "Gitleaks Entropy Scan",
    desc: "High-speed Git history and filesystem high-entropy secret discovery",
    tool: "Gitleaks",
  },
  {
    id: "sast-bandit",
    name: "Bandit Python Analysis",
    desc: "AST-based static analyzer for common security issues in Python code",
    tool: "Bandit",
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
    desc: "Fast HTTP service, security headers, and title discovery",
    tool: "httpx",
  },
  {
    id: "web-discovery",
    name: "Web Discovery",
    desc: "Comprehensive HTTP/HTTPS port, tech, and service discovery",
    tool: "katana + httpx",
  },
  {
    id: "network-portscan",
    name: "Full Network Scan",
    desc: "Detailed TCP service and version detection (-sV -T4)",
    tool: "nmap",
  },
  {
    id: "fast-portscan",
    name: "Fast Portscan",
    desc: "High-speed port availability scanning",
    tool: "masscan",
  },
  {
    id: "smart-portscan",
    name: "Smart Portscan",
    desc: "Fast reliable TCP port discovery",
    tool: "naabu",
  },
  {
    id: "content-discovery",
    name: "Content Discovery",
    desc: "Web directory, route, and file fuzzing",
    tool: "ffuf",
  },
  {
    id: "deep-content-discovery",
    name: "Deep Content Discovery",
    desc: "Recursive high-speed content discovery",
    tool: "feroxbuster",
  },
  {
    id: "web-crawl",
    name: "Web Crawl",
    desc: "Dynamic JS-aware spider and endpoint extraction",
    tool: "katana",
  },
  {
    id: "vuln-assessment",
    name: "Vuln Assessment",
    desc: "Template-based vulnerability assessment",
    tool: "nuclei",
  },
  {
    id: "xss-scan",
    name: "XSS Scan",
    desc: "Cross-Site Scripting (DOM, Reflected, Stored) analysis",
    tool: "dalfox",
  },
  {
    id: "dast-zap",
    name: "OWASP ZAP",
    desc: "Automated web application vulnerability scan",
    tool: "zap",
  },
  {
    id: "oob-interaction",
    name: "OOB Interaction",
    desc: "Out-of-band interaction & Blind SSRF verification",
    tool: "interactsh",
  },
  {
    id: "dns-recon",
    name: "DNS Recon",
    desc: "DNS record resolution (A, CNAME, MX, TXT)",
    tool: "dnsx",
  },
  {
    id: "subdomain-takeover",
    name: "Subdomain Takeover",
    desc: "Subdomain takeover detection via dangling CNAMEs",
    tool: "subzy",
  },
  {
    id: "waf-detect",
    name: "WAF Fingerprint",
    desc: "WAF & CDN vendor fingerprinting",
    tool: "wafw00f",
  },
  {
    id: "cors-audit",
    name: "CORS Audit",
    desc: "CORS misconfiguration and credential theft testing",
    tool: "corsy",
  },
  {
    id: "crlf-scan",
    name: "CRLF Injection",
    desc: "CRLF injection & HTTP response splitting detection",
    tool: "crlfuzz",
  },
  {
    id: "ssti-scan",
    name: "SSTI Scan",
    desc: "Server-Side Template Injection discovery",
    tool: "sstimap",
  },
];

export const PROFILES = [...SAST_PROFILES, ...DAST_PROFILES];

export interface ConvertScanResultOptions {
  isSast?: boolean;
  profile?: string;
}

export function convertScanResultToFindings(
  result: ScanResultRead,
  targetValue: string,
  options?: ConvertScanResultOptions,
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

    const rawAny = raw as unknown as Record<string, unknown>;
    const rawCode = typeof rawAny.code === "string" ? rawAny.code : "";
    const evidenceObj =
      typeof rawAny.evidence === "object" && rawAny.evidence !== null
        ? (rawAny.evidence as Record<string, unknown>)
        : undefined;

    const hasSastToolPrefix =
      rawCode.startsWith("JOERN") ||
      rawCode.startsWith("SEMGREP") ||
      rawCode.startsWith("TRUFFLEHOG") ||
      rawCode.startsWith("GITLEAKS") ||
      rawCode.startsWith("CODEQL") ||
      rawCode.startsWith("AST_GREP");

    const hasSastEvidence = Boolean(
      evidenceObj?.flow ||
      evidenceObj?.detector ||
      evidenceObj?.check_id ||
      (typeof evidenceObj?.file === "string" &&
        !evidenceObj.file.includes("://") &&
        /\.(tsx?|jsx?|py|java|go|c|cpp|rs|php|rb|html|vue|svelte)$/i.test(evidenceObj.file))
    );

    const hasDastIndicators = Boolean(
      rawAny.matched_at ||
      rawAny.template_id ||
      rawAny.host ||
      rawCode.startsWith("SEC_HEADER_") ||
      rawCode.startsWith("SSL_") ||
      rawCode.startsWith("TLS_") ||
      rawCode.startsWith("CORS_") ||
      rawCode.startsWith("CSP_") ||
      rawCode.startsWith("WAF_") ||
      rawCode.startsWith("PORT_") ||
      rawCode.startsWith("OPEN_PORT_") ||
      rawCode.startsWith("DNS_") ||
      rawCode.startsWith("NUCLEI_") ||
      rawCode.startsWith("DALFOX_") ||
      rawCode.startsWith("KATANA_") ||
      rawCode.startsWith("HTTPX_") ||
      rawCode.startsWith("FEROX_") ||
      rawCode.startsWith("FFUF_") ||
      rawCode.startsWith("ZAP_") ||
      rawCode.startsWith("NIKTO_")
    );

    let isSastFinding: boolean;
    if (options?.isSast !== undefined) {
      isSastFinding = options.isSast;
    } else if (options?.profile) {
      isSastFinding = options.profile.startsWith("sast-");
    } else if (hasDastIndicators) {
      isSastFinding = false;
    } else if (hasSastToolPrefix || hasSastEvidence) {
      isSastFinding = true;
    } else {
      isSastFinding = "code" in raw && typeof raw.code === "string";
    }

    if (isSastFinding) {
      const item = raw as SastFindingSummary;
      const evidence =
        typeof item.evidence === "object" && item.evidence !== null
          ? (item.evidence as SastFindingEvidence)
          : undefined;

      const codeStr = item.code || "";
      const titleLowerSast = item.title.toLowerCase();
      const isTrufflehog =
        codeStr.startsWith("TRUFFLEHOG") || Boolean(evidence?.detector);
      const isGitleaks =
        codeStr.startsWith("GITLEAKS") ||
        titleLowerSast.includes("gitleaks") ||
        codeStr.toLowerCase().includes("entropy");
      const isJoern = codeStr.startsWith("JOERN") || Boolean(evidence?.flow);
      const hostOrPath =
        evidence?.file || evidence?.location || targetValue;
      const isSecret = isTrufflehog || isGitleaks;
      const sastText = `${codeStr} ${titleLowerSast}`.toLowerCase();
      const sinkClass: SinkClass = isSecret
        ? "secret-exposure"
        : sastText.includes("sql")
          ? "sql-injection"
          : sastText.includes("command") ||
              sastText.includes("exec") ||
              sastText.includes("shell")
            ? "command-injection"
            : sastText.includes("traversal") || sastText.includes("directory")
              ? "path-traversal"
              : sastText.includes("xss") ||
                  sastText.includes("cross-site scripting") ||
                  sastText.includes("ssti") ||
                  sastText.includes("template injection") ||
                  sastText.includes("eval")
                ? "code-injection"
                : sastText.includes("prototype") || sastText.includes("pollution")
                  ? "prototype-pollution"
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
              : sinkClass === "path-traversal"
                ? "CWE-22"
                : sinkClass === "code-injection"
                  ? "CWE-94"
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
        scope: isSecret ? "secrets" : "code",
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
      const item = raw as RemoteFindingSummary & { code?: string; remediation?: string };
      const rawCode = typeof item.code === "string" ? item.code : "";
      const hostOrPath = item.matched_at || item.host || targetValue;
      const ruleSlug = (item.template_id || rawCode || item.title || "generic")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const titleLowerDast = item.title.toLowerCase();
      const sinkClass: SinkClass =
        titleLowerDast.includes("sql") || titleLowerDast.includes("sqli")
          ? "sql-injection"
          : titleLowerDast.includes("xss") ||
              titleLowerDast.includes("cross-site scripting") ||
              titleLowerDast.includes("ssti") ||
              titleLowerDast.includes("template injection")
            ? "code-injection"
            : titleLowerDast.includes("traversal") ||
                titleLowerDast.includes("directory listing")
              ? "path-traversal"
              : titleLowerDast.includes("command") ||
                  titleLowerDast.includes("rce") ||
                  titleLowerDast.includes("shell")
                ? "command-injection"
                : titleLowerDast.includes("secret") ||
                    titleLowerDast.includes("credential") ||
                    titleLowerDast.includes("token leak")
                  ? "secret-exposure"
                  : "ssrf";

      const cwe =
        item.cwe ||
        (titleLowerDast.includes("xss") ||
        titleLowerDast.includes("cross-site scripting")
          ? "CWE-79"
          : titleLowerDast.includes("ssti") ||
              titleLowerDast.includes("template injection")
            ? "CWE-1336"
            : titleLowerDast.includes("crlf")
              ? "CWE-113"
              : titleLowerDast.includes("cors")
                ? "CWE-942"
                : titleLowerDast.includes("takeover")
                  ? "CWE-284"
                  : sinkClass === "sql-injection"
                    ? "CWE-89"
                    : sinkClass === "command-injection"
                      ? "CWE-78"
                      : sinkClass === "path-traversal"
                        ? "CWE-22"
                        : severity === "critical"
                          ? "CWE-94"
                          : severity === "high"
                            ? "CWE-200"
                            : "CWE-16");

      const probeTargetUrl =
        targetValue.startsWith("http://") || targetValue.startsWith("https://")
          ? targetValue
          : `https://${targetValue}`;

      const traceSteps: TaintStep[] = [
        {
          filePath: probeTargetUrl,
          line: 1,
          label: `Probe Target: ${targetValue}`,
          role: "source" as const,
        },
        {
          filePath: hostOrPath,
          line: 1,
          label: `${item.title} (${rawCode || item.template_id || "vulnerability"})`,
          role: "sink" as const,
        },
      ];

      findings.push({
        id: findingId,
        ruleId: `remote-${ruleSlug}`,
        scope: "endpoint",
        code: rawCode || item.template_id || "remote_vuln",
        title: item.title,
        description:
          item.description ||
          `Dynamic scan finding identified by ${rawCode || item.template_id || "remote orchestrator"} at ${hostOrPath}.`,
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
    }
  }

  return deduplicateFindings(findings);
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
        // onPollScan already polls until the scan is terminal (backing off and
        // retrying transient errors host-side), so it is awaited once. It used
        // to be re-invoked from a 2s setInterval, stacking a new long-running
        // poll loop on every tick and multiplying request load.
        try {
          const { scan: updatedScan, result } = await onPollScan(scan.id);
          setActiveScan(updatedScan);
          if (result) {
            setScanResult(result);
          }
        } catch (pollErr: unknown) {
          setErrorMsg(toStructuredError(pollErr, "orchestrator"));
        } finally {
          setIsLoading(false);
        }
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
    const findings = convertScanResultToFindings(scanResult, targetValue, {
      isSast: scanCategory === "sast",
      profile: selectedProfile,
    });
    onImportFindings(findings);
    setImportedCount(findings.length);
  };

  const activeProfiles =
    scanCategory === "sast" ? SAST_PROFILES : DAST_PROFILES;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-vscode-bg p-4 text-vscode-fg font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-vscode-border pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-vscode-primary/20 border border-vscode-focus/40 text-severity-medium">
            <RemoteScanIcon size={16} />
          </div>
          <div>
            <h2 className="text-xs font-semibold tracking-tight text-vscode-fg">
              Authorized Scan Orchestrator
            </h2>
            <p className="text-[11px] text-vscode-muted">
              Targeted dynamic security scanning and cloud vulnerability
              discovery
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center rounded-md border border-vscode-border bg-vscode-card p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("scanner")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
              activeTab === "scanner"
                ? "bg-vscode-primary text-white shadow-sm font-semibold"
                : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover active:bg-vscode-card-hover"
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
                ? "bg-vscode-primary text-white shadow-sm font-semibold"
                : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover active:bg-vscode-card-hover"
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-vscode-muted">
                Target Domain / Host
              </label>
              <input
                type="text"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="example.com"
                className="mt-1 w-full rounded border border-vscode-border bg-vscode-border px-2.5 py-1.5 text-xs text-vscode-fg placeholder-vscode-muted focus:border-vscode-focus focus:ring-1 focus:ring-vscode-focus focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-vscode-muted">
                Owner Reference
              </label>
              <input
                type="text"
                value={ownerRef}
                onChange={(e) => setOwnerRef(e.target.value)}
                placeholder="Security Team <secops@example.com>"
                className="mt-1 w-full rounded border border-vscode-border bg-vscode-border px-2.5 py-1.5 text-xs text-vscode-fg placeholder-vscode-muted focus:border-vscode-focus focus:ring-1 focus:ring-vscode-focus focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-vscode-muted">
                Authorization Ticket
              </label>
              <input
                type="text"
                value={authRef}
                onChange={(e) => setAuthRef(e.target.value)}
                placeholder="SEC-AUTH-2026"
                className="mt-1 w-full rounded border border-vscode-border bg-vscode-border px-2.5 py-1.5 text-xs text-vscode-fg placeholder-vscode-muted focus:border-vscode-focus focus:ring-1 focus:ring-vscode-focus focus:outline-none"
              />
            </div>
          </div>

          {/* Scan Category and Profile Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-vscode-muted">
                Scan Profile & Engine
              </label>
              <div className="flex items-center rounded border border-vscode-border bg-vscode-bg p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setScanCategory("sast");
                    setSelectedProfile("sast-joern");
                  }}
                  className={`rounded px-2.5 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                    scanCategory === "sast"
                      ? "bg-vscode-primary text-white font-semibold"
                      : "text-vscode-muted hover:text-vscode-fg"
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
                      ? "bg-vscode-primary text-white font-semibold"
                      : "text-vscode-muted hover:text-vscode-fg"
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
                        ? "border-vscode-focus bg-vscode-card-selected text-vscode-fg font-semibold shadow-sm ring-1 ring-vscode-focus"
                        : "border-vscode-border bg-vscode-card text-vscode-fg hover:border-vscode-border hover:bg-vscode-card-hover"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-xs font-semibold">{p.name}</span>
                      <span className="rounded bg-vscode-bg border border-vscode-border px-1.5 py-0.2 text-[10px] font-mono text-severity-low">
                        {p.tool}
                      </span>
                    </div>
                    <span className="mt-1 text-[11px] leading-tight text-vscode-muted">
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {scanCategory === "sast" && (
              <div className="mt-2.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-vscode-muted">
                  Rule Tags (Optional, comma-separated e.g. sqli, rce, owasp, cwe)
                </label>
                <input
                  type="text"
                  value={ruleTags}
                  onChange={(e) => setRuleTags(e.target.value)}
                  placeholder="sqli, rce, owasp"
                  className="mt-1 w-full rounded border border-vscode-border bg-vscode-border px-2.5 py-1.5 text-xs text-vscode-fg placeholder-vscode-muted focus:border-vscode-focus focus:ring-1 focus:ring-vscode-focus focus:outline-none"
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
              className="flex items-center gap-1.5 rounded bg-vscode-primary hover:bg-vscode-primary-hover px-4 py-1.5 text-xs font-semibold text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                className="flex items-center gap-1 rounded border border-[#BE1100] bg-[#5A1D1D] hover:bg-[#6E2424] px-3 py-1.5 text-xs font-semibold text-severity-critical transition cursor-pointer"
              >
                <XCircleIcon size={13} />
                <span>Cancel Scan</span>
              </button>
            )}
          </div>

          {/* Status & Results Display */}
          {activeScan && (
            <div className="mt-2 rounded border border-vscode-border bg-vscode-card p-3.5 shadow-md">
              <div className="flex items-center justify-between border-b border-vscode-border pb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon size={14} className="text-severity-medium" />
                  <span className="text-xs font-semibold text-vscode-fg">
                    Scan Job: {activeScan.id}
                  </span>
                </div>
                <span
                  className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    activeScan.status === "completed"
                      ? "border-[#4EC9B0]/50 bg-[#1E3B20] text-severity-low"
                      : activeScan.status === "running"
                        ? "border-vscode-focus/50 bg-vscode-card-selected text-severity-medium animate-pulse"
                        : activeScan.status === "failed"
                          ? "border-[#BE1100] bg-[#5A1D1D] text-severity-critical"
                          : "border-severity-high/50 bg-severity-high-bg text-severity-high"
                  }`}
                >
                  {activeScan.status}
                </span>
              </div>

              {scanResult && scanResult.summary && (
                <div className="mt-3 flex flex-col gap-3">
                  {/* Risk Breakdown Chips & Import Action */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-vscode-border pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-vscode-muted">
                        Findings:
                      </span>
                      <span className="rounded border border-[#BE1100] bg-[#5A1D1D] px-1.5 py-0.2 text-[11px] font-semibold text-severity-critical">
                        {scanResult.summary.risk_summary?.critical || 0}{" "}
                        Critical
                      </span>
                      <span className="rounded border border-severity-high/50 bg-severity-high-bg px-1.5 py-0.2 text-[11px] font-semibold text-severity-high">
                        {scanResult.summary.risk_summary?.high || 0} High
                      </span>
                      <span className="rounded border border-vscode-focus/50 bg-vscode-card-selected px-1.5 py-0.2 text-[11px] font-semibold text-severity-medium">
                        {scanResult.summary.risk_summary?.medium || 0} Medium
                      </span>
                      <span className="rounded border border-vscode-border bg-vscode-btn-secondary px-1.5 py-0.2 text-[11px] font-semibold text-vscode-muted">
                        {scanResult.summary.risk_summary?.info || 0} Info
                      </span>
                    </div>

                    {onImportFindings && (
                      <button
                        type="button"
                        onClick={handleImportToWorkspace}
                        className="flex items-center gap-1.5 rounded border border-vscode-border bg-vscode-btn-secondary hover:bg-vscode-btn-secondary-hover px-2.5 py-1 text-xs font-medium text-vscode-fg transition shadow-sm cursor-pointer"
                      >
                        <DownloadIcon size={13} className="text-severity-medium" />
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
                        <h4 className="text-xs font-semibold text-vscode-fg">
                          Discovered Vulnerabilities:
                        </h4>
                        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                          {scanResult.summary.findings.map((f, idx) => (
                            <div
                              key={idx}
                              className="flex items-start justify-between rounded border border-vscode-border bg-vscode-bg p-2 text-xs hover:border-vscode-border transition"
                            >
                              <div>
                                <div className="font-semibold text-vscode-fg">
                                  {f.title}
                                </div>
                                {f.description && (
                                  <div className="text-[11px] text-vscode-muted mt-0.5">
                                    {f.description}
                                  </div>
                                )}
                              </div>
                              <span
                                className={`rounded border px-1.5 py-0.2 text-[10px] font-semibold uppercase tracking-wider shrink-0 ml-2 ${
                                  f.severity === "critical"
                                    ? "border-[#BE1100] bg-[#5A1D1D] text-severity-critical"
                                    : f.severity === "high"
                                      ? "border-severity-high/50 bg-severity-high-bg text-severity-high"
                                      : "border-vscode-focus/50 bg-vscode-card-selected text-severity-medium"
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
          <div className="flex items-center justify-between border-b border-vscode-border pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-vscode-muted">
              Recent Audit Trail
            </h3>
            <span className="text-[11px] text-vscode-dim">
              {auditEvents.length} events loaded
            </span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto font-mono text-[11px]">
            {auditEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between rounded border border-vscode-border bg-vscode-card px-3 py-1.5 text-vscode-fg"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-severity-low">
                    {evt.action}
                  </span>
                  <span className="text-vscode-muted">[{evt.resource_type}]</span>
                </div>
                <span className="text-[10px] text-vscode-muted">
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
