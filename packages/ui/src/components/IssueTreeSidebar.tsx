import React, { useState, useMemo, useRef, useEffect } from "react";
import type { Finding } from "@whoami/types";
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
  ShieldCheckIcon,
  TerminalIcon,
  XIcon,
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

export function IssueTreeSidebar({
  findings,
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
  className = "",
}: IssueTreeSidebarProps): React.ReactElement {
  const [sectionFilter, setSectionFilter] = useState<IssueSectionFilter>(activeScanMode);
  const [groupingMode, setGroupingMode] = useState<IssueGroupingMode>("file");
  const [isGroupingDropdownOpen, setIsGroupingDropdownOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

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

  // 1. Code findings (Source code issues, whether local or remote SAST Joern/Semgrep)
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

  // 2. Secret findings (leaked tokens, keys, passwords, TruffleHog)
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

  // 3. Endpoint findings (DAST, live URLs, open ports, nuclei templates)
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
    if (sectionFilter === "code" || sectionFilter === "cloud-sast") return codeFindings;
    if (sectionFilter === "secrets") return secretFindings;
    if (sectionFilter === "endpoint" || sectionFilter === "target-dast") return endpointFindings;
    if (sectionFilter === "local" || sectionFilter === "local-offline") return localFindings;
    if (sectionFilter === "orchestrator") return orchestratorFindings;
    return findings;
  }, [
    sectionFilter,
    codeFindings,
    secretFindings,
    endpointFindings,
    localFindings,
    orchestratorFindings,
    findings,
  ]);

  // Filter findings based on search query
  const filteredFindings = useMemo(() => {
    if (!searchQuery.trim()) return sectionFindings;
    const q = searchQuery.toLowerCase();
    return sectionFindings.filter((f) => {
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
  }, [sectionFindings, searchQuery]);

  // Compute groups based on grouping mode
  const groups: IssueGroup[] = useMemo(() => {
    if (filteredFindings.length === 0) return [];

    if (groupingMode === "file") {
      const map = new Map<string, Finding[]>();
      for (const finding of filteredFindings) {
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

    if (groupingMode === "severity") {
      const order = ["critical", "high", "medium", "low"];
      const map = new Map<string, Finding[]>();
      for (const s of order) map.set(s, []);

      for (const finding of filteredFindings) {
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
    for (const finding of filteredFindings) {
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
  }, [filteredFindings, groupingMode]);

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

  return (
    <aside
      aria-label="Issues Explorer"
      className={`flex w-full h-full flex-col bg-[#252526] text-[#D4D4D4] font-sans select-none overflow-hidden ${className || ""}`}
    >
      {/* 1. Top Header: Title & Grouping Mode Dropdown */}
      <div className="flex items-center justify-between border-b border-[#303031] bg-[#181818] px-3 py-2 text-xs font-semibold shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CodefyLogo
            size={16}
            className="text-[#388BFD] hover:text-[#79B8FF] transition-colors shrink-0"
            title="Codefy"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4D4D4] shrink-0">
            Issues
          </span>
          <span className="rounded bg-[#3A3D41] px-1.5 py-0.2 text-[10px] font-mono font-medium text-[#D4D4D4]">
            {filteredFindings.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* ≡ Three Horizontal Lines Menu Button (Wireframe Design) */}
          <div className="relative" ref={modeDropdownRef}>
            <button
              type="button"
              onClick={() => setIsModeDropdownOpen((prev) => !prev)}
              title="Issues Menu (Scan Modes, Grouping, Actions)"
              aria-label="Issues Menu"
              className={`p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                isModeDropdownOpen
                  ? "bg-[#0E639C] text-white shadow-sm"
                  : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E]"
              }`}
            >
              <MenuIcon size={14} />
            </button>

            {isModeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-[#3C3C3C] bg-[#252526] p-1.5 shadow-2xl font-sans text-xs">
                {/* 1. Scan Mode Section */}
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#858585]">
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
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FolderIcon size={12} className="text-[#CCA700]" />
                    <span>Local (Offline)</span>
                  </div>
                  {(sectionFilter === "local" ||
                    sectionFilter === "local-offline" ||
                    sectionFilter === "code") && <span className="text-white font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSectionSelect("cloud-sast");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    sectionFilter === "cloud-sast"
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon size={12} className="text-[#75BEFF]" />
                    <span>Cloud SAST</span>
                  </div>
                  {sectionFilter === "cloud-sast" && <span className="text-white font-bold">✓</span>}
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
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RemoteScanIcon size={12} className="text-[#89D185]" />
                    <span>Target DAST</span>
                    <span className="sr-only">Orchestrator</span>
                  </div>
                  {(sectionFilter === "orchestrator" ||
                    sectionFilter === "target-dast" ||
                    sectionFilter === "endpoint") && <span className="text-white font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSectionSelect("all");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                    sectionFilter === "all"
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon size={12} className="text-[#D4D4D4]" />
                    <span>All Issues ({findings.length})</span>
                  </div>
                  {sectionFilter === "all" && <span className="text-white font-bold">✓</span>}
                </button>

                {/* 2. Grouping Mode Section */}
                <div className="border-t border-[#3C3C3C] my-1.5" />
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#858585]">
                  Group Findings
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setGroupingMode("file");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer ${
                    groupingMode === "file"
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <span>By File</span>
                  {groupingMode === "file" && <span className="text-white font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGroupingMode("severity");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer ${
                    groupingMode === "severity"
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <span>By Severity</span>
                  {groupingMode === "severity" && <span className="text-white font-bold">✓</span>}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setGroupingMode("category");
                    setIsModeDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-2 py-1 rounded text-xs text-left cursor-pointer ${
                    groupingMode === "category"
                      ? "bg-[#094771] text-white font-medium"
                      : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                  }`}
                >
                  <span>By Category</span>
                  {groupingMode === "category" && <span className="text-white font-bold">✓</span>}
                </button>

                {/* 3. Refresh Action */}
                {onRefreshScan && (
                  <>
                    <div className="border-t border-[#3C3C3C] my-1.5" />
                    <button
                      type="button"
                      onClick={() => {
                        onRefreshScan();
                        setIsModeDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-2 py-1.5 rounded text-xs text-left text-[#CCCCCC] hover:bg-[#2A2D2E] hover:text-white cursor-pointer"
                    >
                      <RefreshCwIcon
                        size={12}
                        className={isRefreshing ? "animate-spin text-[#75BEFF]" : "text-[#858585]"}
                      />
                      <span>Refresh Scan</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Panel Layout Toggle Icon (Primary Sidebar only) */}
          <button
            type="button"
            onClick={onToggleLeftSidebar}
            title="Toggle Primary Sidebar"
            aria-label="Toggle Primary Sidebar"
            className={`p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
              isLeftSidebarOpen !== false
                ? "bg-[#0E639C] text-white shadow-sm"
                : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E]"
            }`}
          >
            <PanelLeftIcon size={13} />
          </button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex items-center border-b border-[#303031] bg-[#1E1E1E]/60 px-2 py-1.5 gap-1.5 shrink-0">
        <SearchIcon size={12} className="text-[#858585] shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter issues…"
          className="flex-1 bg-transparent text-xs text-[#E0E0E0] outline-none placeholder-[#666666] font-mono text-[11px]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            title="Clear search"
            className="text-[#858585] hover:text-white cursor-pointer"
          >
            <XIcon size={11} />
          </button>
        )}
      </div>

      {/* 4. Issue Accordion Tree Groups */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-[#858585] gap-3">
            {isRefreshing ? (
              <div className="flex items-center gap-2 text-[#75BEFF]">
                <RefreshCwIcon size={14} className="animate-spin" />
                <span>Scanning for issues…</span>
              </div>
            ) : searchQuery ? (
              <div>No matching issues found for "{searchQuery}"</div>
            ) : sectionFilter === "orchestrator" ? (
              <div className="flex flex-col items-center gap-2">
                <RemoteScanIcon size={24} className="text-[#89D185]/60" />
                <div className="font-medium text-[#CCCCCC]">No Orchestrator Issues Found</div>
                <div className="text-[11px] text-[#858585]">
                  Select tasks in the top Orchestrator Scan header and run a remote scan.
                </div>
                {onTriggerOrchestratorScan && (
                  <button
                    type="button"
                    onClick={onTriggerOrchestratorScan}
                    className="mt-1 flex items-center gap-1.5 rounded bg-[#0E639C] hover:bg-[#1177BB] px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    <RemoteScanIcon size={12} />
                    <span>Run Orchestrator Scan</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ShieldCheckIcon size={24} className="text-[#75BEFF]/60" />
                <div className="font-medium text-[#CCCCCC]">No Local Issues Detected</div>
                <div className="text-[11px] text-[#858585]">
                  Scan a workspace folder to trace data flows and vulnerabilities.
                </div>
                {onRefreshScan && (
                  <button
                    type="button"
                    onClick={onRefreshScan}
                    className="mt-1 flex items-center gap-1.5 rounded bg-[#0E639C] hover:bg-[#1177BB] px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    <RefreshCwIcon size={12} />
                    <span>Scan Folder</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          groups.map((group) => {
            const isExpanded = expandedGroups[group.key] !== false;

            return (
              <div key={group.key} className="flex flex-col mb-1">
                {/* Accordion Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between px-2.5 py-1 text-xs text-[#CCCCCC] hover:bg-[#2A2D2E] transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span
                      className={`text-[#858585] transition-transform duration-100 ease-in-out shrink-0 ${
                        isExpanded ? "rotate-90" : "rotate-0"
                      }`}
                    >
                      <ChevronRightIcon size={11} />
                    </span>

                    {/* Icon based on group type */}
                    {group.iconType === "file" ? (
                      <FolderIcon size={13} className="text-[#CCA700] shrink-0" />
                    ) : group.iconType === "severity" ? (
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                    ) : (
                      <ShieldCheckIcon size={13} className="text-[#75BEFF] shrink-0" />
                    )}

                    <span
                      className="font-semibold text-xs truncate"
                      style={{ color: group.color || "#E0E0E0" }}
                    >
                      {group.label}
                    </span>

                    {group.subLabel && (
                      <span className="text-[10px] text-[#858585] font-mono truncate">
                        {group.subLabel}
                      </span>
                    )}
                  </div>

                  <span className="rounded bg-[#3A3D41] px-1.5 py-0.2 text-[10px] font-mono font-medium text-[#A0A0A0] shrink-0 ml-2">
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
                        ? primaryStep.filePath.split(/[/\\]/).pop() ||
                          primaryStep.filePath
                        : "";
                      const line = primaryStep?.line ?? 1;
                      const sevColor =
                        SEVERITY_COLORS[finding.severity] || "#858585";
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
                              ? "bg-[#04395E] text-white border-l-2 border-[#007ACC]"
                              : "text-[#CCCCCC] hover:bg-[#2A2D2E]/80 hover:text-[#D4D4D4]"
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
                            <span className="font-mono text-[10px] text-[#75BEFF] shrink-0">
                              [{line}]
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pl-3 w-full min-w-0 mt-0.5">
                            {isOrch ? (
                              <span className="rounded bg-[#16301A] border border-[#4EC9B0]/30 px-1 py-0.1 text-[9px] font-mono text-[#89D185] truncate">
                                🌐 {fileBasename}
                              </span>
                            ) : groupingMode !== "file" ? (
                              <span className="font-mono text-[10px] text-[#858585] truncate">
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
          })
        )}
      </div>
    </aside>
  );
}
