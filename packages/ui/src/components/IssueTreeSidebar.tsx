import React, { useState, useMemo, useRef, useEffect } from "react";
import { type Finding, deduplicateFindings } from "@whoami/types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CodefyLogo,
  FolderIcon,
  LockIcon,
  MenuIcon,
  PanelLeftIcon,
  RefreshCwIcon,
  RemoteScanIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TerminalIcon,
  XIcon,
  HistoryIcon,
} from "./Icons.js";
import type { ScanMode } from "@whoami/types";

export type IssueGroupingMode = "file" | "severity" | "category";
export type IssueSectionFilter =
  | "code"
  | "secrets"
  | "endpoint"
  | "local"
  | "orchestrator"
  | "local-offline"
  | "cloud-sast"
  | "target-dast"
  | "sast"
  | "dast"
  | "all";

export interface IssueTreeSidebarProps {
  findings: readonly Finding[];
  selectedFindingId?: string;
  onSelectFinding: (finding: Finding) => void;
  onRefreshScan?: () => void;
  isRefreshing?: boolean;
  activeScanMode?: ScanMode | "all";
  onScanModeChange?: (mode: ScanMode) => void;
  onTriggerOrchestratorScan?: () => void;
  onToggleLeftSidebar?: () => void;
  onToggleBottomPanel?: () => void;
  onToggleRightSection?: () => void;
  isLeftSidebarOpen?: boolean;
  isBottomPanelOpen?: boolean;
  isRightSectionOpen?: boolean;
  onOpenSettings?: () => void;
  onOpenHistory?: () => void;
  className?: string;
}

interface IssueGroup {
  key: string;
  label: string;
  subLabel?: string;
  iconType: "file" | "severity" | "category";
  color?: string;
  items: Finding[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#F14C4C",
  high: "#CCA700",
  medium: "#75BEFF",
  low: "#89D185",
};

/**
 * Check if a finding is categorized as DAST (Dynamic analysis, target endpoint, live probe).
 *
 * `scope` is the primary signal -- SAST findings (local or cloud) carry
 * "code"/"secrets"/"security"/"parser", while cloud DAST findings carry
 * "orchestrator" (see RemoteScanPanel.tsx's convertScanResultToFindings) or
 * "endpoint". Falls back to recognizing a bare domain/IP/URL trace step
 * (a finding with no scope at all can still be DAST), then to known DAST
 * check-code/rule-id prefixes -- but only for an `id.startsWith("remote-")`
 * finding that ISN'T also a known SAST tool's code/rule, since every
 * orchestrator-origin finding (cloud SAST included) shares that "remote-"
 * prefix and a blanket check on it alone would misclassify cloud
 * Joern/Semgrep/TruffleHog/etc. findings as DAST.
 */
function isDastFinding(f: Finding): boolean {
  if (f.scope === "orchestrator" || f.scope === "endpoint") {
    return true;
  }

  // Check if any trace step points to a URL, domain, IP, or network target
  const hasEndpointStep = f.trace.steps.some((s) => {
    const p = s.filePath.trim();
    if (!p) return false;
    if (p.startsWith("http://") || p.startsWith("https://") || p.includes("://")) {
      return true;
    }
    // Hostname/domain pattern (e.g. "nasa.gov", "nasa.gov:1", "api.target.com:443", "test.internal/path")
    if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(p)) {
      return true;
    }
    // IPv4 pattern (e.g. "192.168.1.1", "10.0.0.1:8080")
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/.*)?$/.test(p)) {
      return true;
    }
    return false;
  });

  if (hasEndpointStep) {
    return true;
  }

  // If finding originates from remote scan and has a DAST check code / rule
  const codeUpper = (f.code || "").toUpperCase();
  const ruleIdLower = (f.ruleId || "").toLowerCase();
  const isDastCodeOrRule =
    codeUpper.startsWith("SEC_HEADER_") ||
    codeUpper.startsWith("SSL_") ||
    codeUpper.startsWith("TLS_") ||
    codeUpper.startsWith("CORS_") ||
    codeUpper.startsWith("CSP_") ||
    codeUpper.startsWith("WAF_") ||
    codeUpper.startsWith("PORT_") ||
    codeUpper.startsWith("OPEN_PORT_") ||
    codeUpper.startsWith("DNS_") ||
    codeUpper.startsWith("NUCLEI_") ||
    codeUpper.startsWith("DALFOX_") ||
    codeUpper.startsWith("KATANA_") ||
    codeUpper.startsWith("HTTPX_") ||
    codeUpper.startsWith("FEROX_") ||
    codeUpper.startsWith("FFUF_") ||
    codeUpper.startsWith("ZAP_") ||
    codeUpper.startsWith("NIKTO_") ||
    ruleIdLower.includes("sec-header") ||
    ruleIdLower.includes("open-port") ||
    ruleIdLower.includes("weak-cipher");

  const isKnownSastTool =
    codeUpper.startsWith("JOERN") ||
    codeUpper.startsWith("SEMGREP") ||
    codeUpper.startsWith("TRUFFLEHOG") ||
    codeUpper.startsWith("GITLEAKS") ||
    codeUpper.startsWith("CODEQL") ||
    codeUpper.startsWith("AST_GREP") ||
    ruleIdLower.includes("joern") ||
    ruleIdLower.includes("semgrep") ||
    ruleIdLower.includes("trufflehog") ||
    ruleIdLower.includes("gitleaks") ||
    ruleIdLower.includes("codeql");

  if (f.id.startsWith("remote-") && isDastCodeOrRule && !isKnownSastTool) {
    return true;
  }

  return false;
}

/**
 * Build grouping collections (By File, By Severity, By Category)
 */
function buildGroups(
  findingsList: readonly Finding[],
  mode: IssueGroupingMode,
): IssueGroup[] {
  if (findingsList.length === 0) return [];

  if (mode === "file") {
    const map = new Map<string, Finding[]>();
    for (const finding of findingsList) {
      const primaryStep =
        finding.trace.steps[finding.trace.steps.length - 1] ||
        finding.trace.steps[0];
      const rawPath = primaryStep?.filePath || "unknown";
      const cleanPath = rawPath.replace(/^https?:\/\/[^/]+\/?/, "");
      if (!map.has(cleanPath)) {
        map.set(cleanPath, []);
      }
      map.get(cleanPath)!.push(finding);
    }

    return Array.from(map.entries()).map(([filePath, items]) => {
      const parts = filePath.split(/[/\\]/);
      const fileName = parts.pop() || filePath;
      const dirName = parts.length > 0 ? parts.join("/") : "";

      return {
        key: filePath,
        label: fileName,
        subLabel: dirName,
        iconType: "file" as const,
        items,
      };
    });
  }

  if (mode === "severity") {
    const order = ["critical", "high", "medium", "low"];
    const map = new Map<string, Finding[]>();
    for (const s of order) map.set(s, []);

    for (const finding of findingsList) {
      const sev = finding.severity || "medium";
      if (!map.has(sev)) map.set(sev, []);
      map.get(sev)!.push(finding);
    }

    return order
      .filter((sev) => (map.get(sev)?.length || 0) > 0)
      .map((sev) => ({
        key: sev,
        label: sev.charAt(0).toUpperCase() + sev.slice(1),
        iconType: "severity" as const,
        color: SEVERITY_COLORS[sev] || "#858585",
        items: map.get(sev)!,
      }));
  }

  // Default: category / rule scope
  const map = new Map<string, Finding[]>();
  for (const finding of findingsList) {
    let cat = "Security Vulnerabilities";
    if (
      finding.scope === "orchestrator" ||
      finding.id.startsWith("remote-")
    ) {
      cat = "Orchestrator Probes & CVEs";
    } else if (
      finding.scope === "parser" ||
      finding.ruleId.includes("syntax") ||
      finding.ruleId.includes("parser")
    ) {
      cat = "Syntax / Parser Errors";
    } else if (
      finding.ruleId.includes("secret") ||
      finding.ruleId.includes("token") ||
      finding.ruleId.includes("key")
    ) {
      cat = "Secret & Key Leaks";
    }

    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(finding);
  }

  return Array.from(map.entries()).map(([cat, items]) => ({
    key: cat,
    label: cat,
    iconType: "category" as const,
    color: cat.includes("Syntax")
      ? "#CCA700"
      : cat.includes("Orchestrator")
        ? "#4EC9B0"
        : "#F14C4C",
    items,
  }));
}

export function IssueTreeSidebar({
  findings: rawFindings,
  selectedFindingId,
  onSelectFinding,
  onRefreshScan,
  isRefreshing = false,
  activeScanMode = "local",
  onScanModeChange,
  onTriggerOrchestratorScan,
  onToggleLeftSidebar,
  onToggleBottomPanel,
  onToggleRightSection,
  isLeftSidebarOpen = true,
  isBottomPanelOpen = false,
  isRightSectionOpen = false,
  onOpenSettings,
  onOpenHistory,
  className = "",
}: IssueTreeSidebarProps): React.ReactElement {
  const findings = useMemo(() => deduplicateFindings(rawFindings), [rawFindings]);
  const [sectionFilter, setSectionFilter] = useState<IssueSectionFilter>(activeScanMode);
  const [groupingMode, setGroupingMode] = useState<IssueGroupingMode>("file");
  const [isGroupingDropdownOpen, setIsGroupingDropdownOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Accordion section visibility states for SAST and DAST in "All" mode
  const [isSastSectionOpen, setIsSastSectionOpen] = useState(true);
  const [isDastSectionOpen, setIsDastSectionOpen] = useState(true);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  // Sync internal sectionFilter when activeScanMode prop changes
  useEffect(() => {
    if (activeScanMode) {
      setSectionFilter(activeScanMode);
    }
  }, [activeScanMode]);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modeDropdownRef.current &&
        !modeDropdownRef.current.contains(event.target as Node)
      ) {
        setIsModeDropdownOpen(false);
      }
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsGroupingDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. All SAST findings (Source code, taint flows, syntax, secrets)
  const sastFindings = useMemo(() => {
    return findings.filter((f) => !isDastFinding(f));
  }, [findings]);

  // 2. All DAST findings (Target endpoints, live URLs, orchestrator probes, CVEs)
  const dastFindings = useMemo(() => {
    return findings.filter(isDastFinding);
  }, [findings]);

  // Code findings (Source code issues, whether local or remote SAST Joern/Semgrep)
  const codeFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.scope === "code" ||
        f.scope === "security" ||
        f.scope === "parser" ||
        (!f.scope &&
          !f.id.startsWith("remote-tech") &&
          f.trace.steps.some(
            (s) =>
              !s.filePath.startsWith("http://") &&
              !s.filePath.startsWith("https://"),
          )),
    );
  }, [findings]);

  // Secret findings (leaked tokens, keys, passwords, TruffleHog)
  const secretFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.scope === "secrets" ||
        f.trace.sinkClass === "secret-exposure" ||
        f.code?.toUpperCase().includes("SECRET") ||
        f.ruleId.toLowerCase().includes("secret") ||
        f.ruleId.toLowerCase().includes("key"),
    );
  }, [findings]);

  // Endpoint findings (DAST, live URLs, open ports, nuclei templates)
  const endpointFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.scope === "endpoint" ||
        f.scope === "orchestrator" ||
        f.id.startsWith("remote-tech") ||
        f.trace.steps.some(
          (s) =>
            s.filePath.startsWith("http://") ||
            s.filePath.startsWith("https://"),
        ),
    );
  }, [findings]);

  // Separate findings into Local and Orchestrator (backward compatible for existing tests)
  const localFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.scope !== "orchestrator" &&
        f.scope !== "endpoint" &&
        !f.id.startsWith("remote-") &&
        !f.ruleId.startsWith("remote-"),
    );
  }, [findings]);

  const orchestratorFindings = useMemo(() => {
    return findings.filter(
      (f) =>
        f.scope === "orchestrator" ||
        f.scope === "endpoint" ||
        f.id.startsWith("remote-") ||
        f.ruleId.startsWith("remote-"),
    );
  }, [findings]);

  // Filter findings based on active section filter
  const sectionFindings = useMemo(() => {
    if (sectionFilter === "code") return codeFindings;
    if (sectionFilter === "sast") return sastFindings;
    if (sectionFilter === "dast") return dastFindings;
    if (sectionFilter === "secrets") return secretFindings;
    if (
      sectionFilter === "endpoint" ||
      sectionFilter === "target-dast" ||
      sectionFilter === "orchestrator"
    ) {
      return dastFindings;
    }
    if (sectionFilter === "cloud-sast") {
      const remoteSast = sastFindings.filter(
        (f) => f.id.startsWith("remote-") || f.ruleId.startsWith("remote-"),
      );
      return remoteSast.length > 0 ? remoteSast : sastFindings;
    }
    if (sectionFilter === "local" || sectionFilter === "local-offline") {
      return localFindings.length > 0 ? localFindings : sastFindings;
    }
    return findings;
  }, [
    sectionFilter,
    sastFindings,
    dastFindings,
    codeFindings,
    secretFindings,
    endpointFindings,
    localFindings,
    orchestratorFindings,
    findings,
  ]);

  // Search filter helper
  const filterByQuery = (list: readonly Finding[], query: string) => {
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((f) => {
      const primaryStep =
        f.trace.steps[f.trace.steps.length - 1] || f.trace.steps[0];
      const filePath = primaryStep?.filePath || "";
      const ruleId = f.ruleId || "";
      const title = f.title || "";
      const cwe = f.cwe || "";

      return (
        title.toLowerCase().includes(q) ||
        filePath.toLowerCase().includes(q) ||
        ruleId.toLowerCase().includes(q) ||
        cwe.toLowerCase().includes(q)
      );
    });
  };

  // Filter findings based on search query
  const filteredFindings = useMemo(() => {
    return filterByQuery(sectionFindings, searchQuery);
  }, [sectionFindings, searchQuery]);

  const filteredSastFindings = useMemo(() => {
    return filterByQuery(sastFindings, searchQuery);
  }, [sastFindings, searchQuery]);

  const filteredDastFindings = useMemo(() => {
    return filterByQuery(dastFindings, searchQuery);
  }, [dastFindings, searchQuery]);

  // Compute groups based on grouping mode
  const groups: IssueGroup[] = useMemo(() => {
    if (filteredFindings.length === 0) return [];
    return buildGroups(filteredFindings, groupingMode);
  }, [filteredFindings, groupingMode]);

  const sastGroups: IssueGroup[] = useMemo(() => {
    return buildGroups(filteredSastFindings, groupingMode);
  }, [filteredSastFindings, groupingMode]);

  const dastGroups: IssueGroup[] = useMemo(() => {
    return buildGroups(filteredDastFindings, groupingMode);
  }, [filteredDastFindings, groupingMode]);

  // Severity counts for visualization micro-bar
  const severityBreakdown = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of filteredFindings) {
      const s = f.severity?.toLowerCase();
      if (s === "critical") counts.critical++;
      else if (s === "high") counts.high++;
      else if (s === "medium") counts.medium++;
      else if (s === "low") counts.low++;
    }
    return counts;
  }, [filteredFindings]);

  const totalFiltered = filteredFindings.length;

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  const handleSectionSelect = (section: IssueSectionFilter) => {
    setSectionFilter(section);
    if (section === "local" || section === "local-offline") {
      onScanModeChange?.("local-offline");
    } else if (section === "cloud-sast") {
      onScanModeChange?.("cloud-sast");
    } else if (section === "orchestrator" || section === "target-dast") {
      onScanModeChange?.("orchestrator");
    } else if (section === "code" || section === "endpoint") {
      onScanModeChange?.(section as ScanMode);
    }
  };

  const isAllMode = sectionFilter === "all";
  const isSastActive =
    sectionFilter === "sast" ||
    sectionFilter === "local" ||
    sectionFilter === "local-offline" ||
    sectionFilter === "cloud-sast" ||
    sectionFilter === "code" ||
    sectionFilter === "secrets";
  const isDastActive =
    sectionFilter === "dast" ||
    sectionFilter === "orchestrator" ||
    sectionFilter === "target-dast" ||
    sectionFilter === "endpoint";

  // Reusable Finding Group Renderer
  const renderIssueGroup = (group: IssueGroup, groupPrefix: string) => {
    const fullKey = `${groupPrefix}:${group.key}`;
    const isExpanded = expandedGroups[fullKey] !== false;

    return (
      <div key={fullKey} className="flex flex-col mb-1">
        {/* Accordion Group Header */}
        <button
          type="button"
          onClick={() => toggleGroup(fullKey)}
          className="flex w-full items-center justify-between px-2.5 py-1 text-xs text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer group"
        >
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span
              className={`text-vscode-muted transition-transform duration-100 ease-in-out shrink-0 ${
                isExpanded ? "rotate-90" : "rotate-0"
              }`}
            >
              <ChevronRightIcon size={11} />
            </span>

            {/* Icon based on group type */}
            {group.iconType === "file" ? (
              <FolderIcon size={13} className="text-severity-high shrink-0" />
            ) : group.iconType === "severity" ? (
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: group.color }}
              />
            ) : (
              <ShieldCheckIcon size={13} className="text-severity-medium shrink-0" />
            )}

            <span
              className="font-semibold text-xs truncate"
              style={{ color: group.color || "#E0E0E0" }}
            >
              {group.label}
            </span>

            {group.subLabel && (
              <span className="text-[10px] text-vscode-muted font-mono truncate">
                {group.subLabel}
              </span>
            )}
          </div>

          <span className="rounded bg-vscode-btn-secondary px-1.5 py-0.2 text-[10px] font-mono font-medium text-vscode-dim shrink-0 ml-2">
            {group.items.length}
          </span>
        </button>

        {/* Sub-items */}
        {isExpanded && (
          <div className="flex flex-col">
            {group.items.map((finding) => {
              const isSelected = selectedFindingId === finding.id;
              const primaryStep =
                finding.trace.steps[finding.trace.steps.length - 1] ||
                finding.trace.steps[0];
              const fileBasename = primaryStep
                ? primaryStep.filePath.split(/[/\\]/).pop() || primaryStep.filePath
                : "";
              const line = primaryStep?.line ?? 1;
              const sevColor = SEVERITY_COLORS[finding.severity] || "#858585";
              const isOrch =
                finding.scope === "orchestrator" ||
                finding.id.startsWith("remote-");

              return (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => onSelectFinding(finding)}
                  className={`flex flex-col items-start w-full pl-6 pr-2.5 py-1 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-vscode-card-selected text-vscode-fg font-semibold border-l-2 border-vscode-focus"
                      : "text-vscode-fg hover:bg-vscode-card-hover/80 hover:text-vscode-fg"
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: sevColor }}
                    />
                    <span className="text-xs font-medium truncate leading-tight flex-1">
                      {finding.title}
                    </span>
                    <span className="font-mono text-[10px] text-severity-medium shrink-0">
                      [{line}]
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pl-3 w-full min-w-0 mt-0.5">
                    {isOrch ? (
                      <span className="rounded bg-severity-low/15 border border-severity-low/30 px-1 py-0.1 text-[9px] font-mono text-severity-low truncate">
                        🌐 {fileBasename}
                      </span>
                    ) : groupingMode !== "file" ? (
                      <span className="font-mono text-[10px] text-vscode-muted truncate">
                        {fileBasename}:{line}
                      </span>
                    ) : null}
                    <span className="text-[9px] font-mono text-[#6A9955] truncate">
                      {finding.code || finding.ruleId}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`flex h-full w-full flex-col bg-vscode-bg text-vscode-fg font-sans select-none overflow-hidden ${className}`}
    >
      {/* 1. Header: Title "issues" matching hand-drawn wireframe */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CodefyLogo
            size={15}
            className="text-[#388BFD] hover:text-[#79B8FF] transition-colors shrink-0"
            title="Codefy"
          />
          <span className="text-xs font-bold tracking-wider text-vscode-fg capitalize">
            Issues
          </span>
          <button
            type="button"
            onClick={() => handleSectionSelect("all")}
            title="Show All Issues (SAST & DAST)"
            className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-medium cursor-pointer transition-colors ${
              isAllMode
                ? "bg-vscode-primary text-white"
                : "bg-vscode-border text-vscode-muted hover:bg-vscode-border hover:text-vscode-fg"
            }`}
          >
            {findings.length}
          </button>
        </div>

        {/* Primary Sidebar Toggle Button */}
        {onToggleLeftSidebar && (
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            title="Toggle Primary Sidebar"
            aria-label="Toggle Primary Sidebar"
            className="p-1 rounded text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer flex items-center justify-center"
          >
            <PanelLeftIcon size={13} />
          </button>
        )}
      </div>

      {/* 2. Unified Control Bar: [ SAST | DAST ≡ ] matching hand-drawn wireframe */}
      <div className="px-2.5 py-1 shrink-0">
        <div className="flex items-center rounded-lg border border-vscode-border bg-vscode-card p-0.5 shadow-sm">
          {/* SAST Button */}
          <button
            type="button"
            onClick={() => handleSectionSelect(isSastActive ? "all" : "local-offline")}
            title="Filter to SAST (Static Code Analysis & Secrets)"
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              isSastActive
                ? "bg-vscode-primary text-white shadow-sm font-semibold"
                : "text-vscode-muted hover:text-severity-medium hover:bg-vscode-card-hover"
            }`}
          >
            <ShieldCheckIcon
              size={12}
              className={isSastActive ? "text-white" : "text-severity-medium"}
            />
            <span>SAST</span>
            <span
              className={`rounded-full px-1.5 py-0.1 text-[9px] font-mono ${
                isSastActive
                  ? "bg-white/20 text-white"
                  : "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
              }`}
            >
              {sastFindings.length}
            </span>
          </button>

          {/* Divider Line | */}
          <div className="h-4 w-[1px] bg-vscode-border shrink-0" />

          {/* DAST Button */}
          <button
            type="button"
            onClick={() => handleSectionSelect(isDastActive ? "all" : "target-dast")}
            title="Filter to DAST (Dynamic Endpoints & Probes)"
            className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              isDastActive
                ? "bg-[#107C41] hover:bg-[#0E6C38] text-white shadow-sm font-semibold"
                : "text-vscode-muted hover:text-severity-low hover:bg-vscode-card-hover"
            }`}
          >
            <RemoteScanIcon
              size={12}
              className={isDastActive ? "text-white" : "text-severity-low"}
            />
            <span>DAST</span>
            <span
              className={`rounded-full px-1.5 py-0.1 text-[9px] font-mono ${
                isDastActive
                  ? "bg-white/20 text-white"
                  : "bg-severity-low/15 text-severity-low border border-severity-low/30"
              }`}
            >
              {dastFindings.length}
            </span>
          </button>

          {/* Divider Line | */}
          <div className="h-4 w-[1px] bg-vscode-border shrink-0" />

          {/* ≡ Three Horizontal Lines Menu Button inside the unified container */}
          <div className="relative shrink-0" ref={modeDropdownRef}>
            <button
              type="button"
              onClick={() => setIsModeDropdownOpen((prev) => !prev)}
              title="Issues Menu (Scan Modes, Grouping, Actions)"
              aria-label="Issues Menu"
              className={`p-1.5 rounded-md transition-colors cursor-pointer flex items-center justify-center ${
                isModeDropdownOpen
                  ? "bg-vscode-primary text-white shadow-sm"
                  : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
              }`}
            >
              <MenuIcon size={14} />
            </button>

            {isModeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-md border border-vscode-border bg-vscode-card p-1.5 shadow-2xl font-sans text-xs">
                {/* 1. Scan Mode Section */}
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                  Scan Mode
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSectionSelect("local-offline");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    sectionFilter === "local" ||
                    sectionFilter === "local-offline" ||
                    sectionFilter === "code"
                      ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                      : "text-vscode-fg hover:bg-vscode-card-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FolderIcon size={12} className="text-severity-high" />
                    <span>Local (Offline)</span>
                  </div>
                  {(sectionFilter === "local" ||
                    sectionFilter === "local-offline" ||
                    sectionFilter === "code") && <span className="text-vscode-focus font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSectionSelect("cloud-sast");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    sectionFilter === "cloud-sast"
                      ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                      : "text-vscode-fg hover:bg-vscode-card-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon size={12} className="text-severity-medium" />
                    <span>Cloud SAST</span>
                  </div>
                  {sectionFilter === "cloud-sast" && <span className="text-vscode-focus font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSectionSelect("target-dast");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    sectionFilter === "orchestrator" ||
                    sectionFilter === "target-dast" ||
                    sectionFilter === "endpoint"
                      ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                      : "text-vscode-fg hover:bg-vscode-card-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RemoteScanIcon size={12} className="text-severity-low" />
                    <span>Target DAST</span>
                    <span className="sr-only">Orchestrator</span>
                  </div>
                  {(sectionFilter === "orchestrator" ||
                    sectionFilter === "target-dast" ||
                    sectionFilter === "endpoint") && <span className="text-vscode-focus font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSectionSelect("all");
                    setIsModeDropdownOpen(false);
                  }}
                  title="Show All Issues (SAST & DAST)"
                  className={`flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    sectionFilter === "all"
                      ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                      : "text-vscode-fg hover:bg-vscode-card-hover"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon size={12} className="text-vscode-fg" />
                    <span>All Issues ({findings.length})</span>
                  </div>
                  {sectionFilter === "all" && <span className="text-vscode-focus font-bold">✓</span>}
                </button>

                {/* 2. Grouping Mode Section */}
                <div className="border-t border-vscode-border my-1.5" />
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                  Group Findings
                </div>

                {(["file", "severity", "category"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setGroupingMode(mode);
                      setIsModeDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer ${
                      groupingMode === mode
                        ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                        : "text-vscode-fg hover:bg-vscode-card-hover"
                    }`}
                  >
                    <span>By {mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                    {groupingMode === mode && <span className="text-vscode-focus font-bold">✓</span>}
                  </button>
                ))}

                {/* 3. Refresh Action */}
                {onRefreshScan && (
                  <>
                    <div className="border-t border-vscode-border my-1.5" />
                    <button
                      type="button"
                      onClick={() => {
                        onRefreshScan();
                        setIsModeDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-xs text-left text-vscode-fg hover:bg-vscode-card-hover hover:text-vscode-fg cursor-pointer"
                    >
                      <RefreshCwIcon
                        size={12}
                        className={isRefreshing ? "animate-spin text-severity-medium" : "text-vscode-muted"}
                      />
                      <span>Refresh Scan</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Search Bar: [ Search bar ] matching hand-drawn wireframe */}
      <div className="px-2.5 py-1 shrink-0">
        <div className="flex items-center rounded-md border border-vscode-border bg-vscode-bg px-2.5 py-1.5 gap-2 focus-within:border-vscode-focus transition-colors">
          <SearchIcon size={12} className="text-vscode-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter or search issues..."
            className="flex-1 bg-transparent text-xs text-vscode-fg outline-none placeholder-vscode-muted font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title="Clear search"
              className="text-vscode-muted hover:text-white cursor-pointer"
            >
              <XIcon size={11} />
            </button>
          )}
        </div>
      </div>

      {/* 4. Security Posture Severity Visualization Micro-Bar */}
      {totalFiltered > 0 && (
        <div className="flex flex-col border-b border-vscode-border bg-vscode-header/70 px-2.5 py-1.5 gap-1 shrink-0">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-vscode-card-hover">
            {severityBreakdown.critical > 0 && (
              <div
                style={{
                  width: `${(severityBreakdown.critical / totalFiltered) * 100}%`,
                }}
                className="bg-severity-critical transition-all duration-300"
                title={`Critical: ${severityBreakdown.critical}`}
              />
            )}
            {severityBreakdown.high > 0 && (
              <div
                style={{
                  width: `${(severityBreakdown.high / totalFiltered) * 100}%`,
                }}
                className="bg-severity-high transition-all duration-300"
                title={`High: ${severityBreakdown.high}`}
              />
            )}
            {severityBreakdown.medium > 0 && (
              <div
                style={{
                  width: `${(severityBreakdown.medium / totalFiltered) * 100}%`,
                }}
                className="bg-severity-medium transition-all duration-300"
                title={`Medium: ${severityBreakdown.medium}`}
              />
            )}
            {severityBreakdown.low > 0 && (
              <div
                style={{
                  width: `${(severityBreakdown.low / totalFiltered) * 100}%`,
                }}
                className="bg-severity-low transition-all duration-300"
                title={`Low: ${severityBreakdown.low}`}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-vscode-muted">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-severity-critical" />
              <span className="text-severity-critical font-semibold">{severityBreakdown.critical}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-severity-high" />
              <span className="text-severity-high font-semibold">{severityBreakdown.high}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-severity-medium" />
              <span className="text-severity-medium font-semibold">{severityBreakdown.medium}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-severity-low" />
              <span className="text-severity-low font-semibold">{severityBreakdown.low}</span>
            </span>
          </div>
        </div>
      )}

      {/* 5. Issue Accordion Tree Groups */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {filteredFindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-vscode-muted gap-3">
            {isRefreshing ? (
              <div className="flex items-center gap-2 text-severity-medium">
                <RefreshCwIcon size={14} className="animate-spin" />
                <span>Scanning for issues…</span>
              </div>
            ) : searchQuery ? (
              <div>No matching issues found for "{searchQuery}"</div>
            ) : isDastActive ? (
              <div className="flex flex-col items-center gap-2">
                <RemoteScanIcon size={24} className="text-severity-low/60" />
                <div className="font-medium text-vscode-fg">No Orchestrator Issues Found</div>
                <div className="text-[11px] text-vscode-muted">
                  Select tasks in the top Orchestrator Scan header and run a remote scan.
                </div>
                {onTriggerOrchestratorScan && (
                  <button
                    type="button"
                    onClick={onTriggerOrchestratorScan}
                    className="mt-1 flex items-center gap-1.5 rounded bg-vscode-primary hover:bg-vscode-primary-hover px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    <RemoteScanIcon size={12} />
                    <span>Run Orchestrator Scan</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ShieldCheckIcon size={24} className="text-severity-medium/60" />
                <div className="font-medium text-vscode-fg">No Local Issues Detected</div>
                <div className="text-[11px] text-vscode-muted">
                  Scan a workspace folder to trace data flows and vulnerabilities.
                </div>
                {onRefreshScan && (
                  <button
                    type="button"
                    onClick={onRefreshScan}
                    className="mt-1 flex items-center gap-1.5 rounded bg-vscode-primary hover:bg-vscode-primary-hover px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    <RefreshCwIcon size={12} />
                    <span>Scan Folder</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : isAllMode ? (
          // In "All" mode: Show both SAST and DAST as distinct collapsible sections
          <div className="flex flex-col">
            {/* --- Section 1: SAST (Static Analysis) --- */}
            <div className="border-b border-vscode-border/80 mb-2">
              <button
                type="button"
                onClick={() => setIsSastSectionOpen((prev) => !prev)}
                className="flex w-full items-center justify-between bg-vscode-bg/90 px-2.5 py-1.5 text-xs font-semibold text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-vscode-muted transition-transform duration-100 ${
                      isSastSectionOpen ? "rotate-90" : "rotate-0"
                    }`}
                  >
                    <ChevronRightIcon size={11} />
                  </span>
                  <ShieldCheckIcon size={13} className="text-severity-medium" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-severity-medium">
                    SAST (Static Analysis)
                  </span>
                </div>
                <span className="rounded bg-vscode-focus/15 border border-vscode-focus/30 px-1.5 py-0.2 text-[10px] font-mono text-severity-medium">
                  {filteredSastFindings.length}
                </span>
              </button>

              {isSastSectionOpen && (
                <div className="py-1">
                  {sastGroups.length === 0 ? (
                    <div className="px-6 py-2 text-center text-xs text-vscode-muted italic">
                      No SAST issues detected
                    </div>
                  ) : (
                    sastGroups.map((g) => renderIssueGroup(g, "sast"))
                  )}
                </div>
              )}
            </div>

            {/* --- Section 2: DAST (Dynamic Analysis - Bottom Section) --- */}
            <div>
              <button
                type="button"
                onClick={() => setIsDastSectionOpen((prev) => !prev)}
                className="flex w-full items-center justify-between bg-vscode-bg/90 px-2.5 py-1.5 text-xs font-semibold text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-vscode-muted transition-transform duration-100 ${
                      isDastSectionOpen ? "rotate-90" : "rotate-0"
                    }`}
                  >
                    <ChevronRightIcon size={11} />
                  </span>
                  <RemoteScanIcon size={13} className="text-severity-low" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-severity-low">
                    DAST (Dynamic Analysis)
                  </span>
                </div>
                <span className="rounded bg-severity-low/15 border border-severity-low/30 px-1.5 py-0.2 text-[10px] font-mono text-severity-low">
                  {filteredDastFindings.length}
                </span>
              </button>

              {isDastSectionOpen && (
                <div className="py-1">
                  {dastGroups.length === 0 ? (
                    <div className="px-6 py-2 text-center text-xs text-vscode-muted italic">
                      No DAST issues detected
                    </div>
                  ) : (
                    dastGroups.map((g) => renderIssueGroup(g, "dast"))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          // In single-section mode: Render the filtered groups directly
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-vscode-muted border-b border-vscode-border/60 mb-1">
              <div className="flex items-center gap-1.5">
                {isDastActive ? (
                  <>
                    <RemoteScanIcon size={12} className="text-severity-low" />
                    <span className="text-severity-low">DAST Findings</span>
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon size={12} className="text-severity-medium" />
                    <span className="text-severity-medium">SAST Findings</span>
                  </>
                )}
              </div>
              <span className="font-mono text-vscode-dim">
                {filteredFindings.length}
              </span>
            </div>

            {groups.map((group) => renderIssueGroup(group, "filtered"))}
          </div>
        )}
      </div>

      {/* Footer Bar: Setting & History Buttons (matches user wireframe sketch) */}
      <div className="border-t border-vscode-border bg-vscode-header px-2 py-1.5 shrink-0 select-none">
        <div className="flex items-center justify-between rounded border border-vscode-border bg-vscode-card px-2 py-1 shadow-sm">
          {/* Setting Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onOpenSettings?.();
            }}
            title="Settings (Account, Tips, History, About, Plans)"
            className="group flex items-center gap-1.5 rounded px-2 py-1 text-xs text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-all cursor-pointer"
          >
            <SettingsIcon size={14} className="text-vscode-muted group-hover:text-vscode-focus transition-colors" />
            <span className="font-medium text-[11px]">Setting</span>
          </button>

          <div className="h-3.5 w-px bg-vscode-border" />

          {/* History Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onOpenHistory?.();
            }}
            title="Scan History & Past Sessions"
            className="group flex items-center gap-1.5 rounded px-2 py-1 text-xs text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-all cursor-pointer"
          >
            <HistoryIcon size={14} className="text-vscode-muted group-hover:text-[#4EC9B0] transition-colors" />
            <span className="font-medium text-[11px]">History</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
