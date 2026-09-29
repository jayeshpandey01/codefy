import React, { useState, useRef, useEffect, useCallback } from "react";
import type {
  AllScanProfile,
  ScanModeTier,
  ScanProfile,
  SastProfile,
} from "@whoami/types";
import {
  CheckIcon,
  ChevronDownIcon,
  ColumnsIcon,
  DownloadIcon,
  FileCodeIcon,
  FocusIcon,
  FolderIcon,
  MenuIcon,
  NetworkIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  RefreshCwIcon,
  RowsIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TerminalIcon,
} from "./Icons.js";
import {
  WHOLE_CODE_GRAPH_OPTIONS,
  type GraphViewType,
} from "./GraphSelectorDropdown.js";

export type ScanMode = ScanModeTier | "local" | "orchestrator";

export interface ScanProfileOption {
  readonly id: AllScanProfile | "secret-scan";
  readonly name: string;
  readonly desc: string;
  readonly tool: string;
}

export const CLOUD_SAST_TASKS: ScanProfileOption[] = [
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
];

export const TARGET_DAST_TASKS: ScanProfileOption[] = [
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

export const DEFAULT_ORCHESTRATOR_TASKS: ScanProfileOption[] = [
  ...CLOUD_SAST_TASKS,
  ...TARGET_DAST_TASKS,
];

export interface UnifiedScanHeaderProps {
  readonly scanMode?: ScanMode;
  readonly onScanModeChange?: (mode: ScanMode) => void;

  // Local scan props
  readonly currentFolderPath?: string;
  readonly recentFolders?: readonly string[];
  readonly onFolderChange?: (folderPath: string) => void;
  readonly onBrowseFolder?: () => Promise<string | null> | void;
  readonly onScanLocal?: (folderPath: string) => void;
  readonly isLocalScanning?: boolean;
  readonly localProgress?: { scanned: number; total: number } | null;

  // Cloud SAST scan props
  readonly onScanCloudSast?: (params: {
    folderPath: string;
    profiles: (AllScanProfile | "secret-scan")[];
    ruleTags?: string[];
  }) => void;
  readonly isCloudSastScanning?: boolean;
  readonly cloudSastProgress?: {
    currentTask: string;
    completed: number;
    total: number;
  } | null;

  // Orchestrator scan props
  readonly defaultTarget?: string;
  readonly onScanOrchestrator?: (params: {
    target: string;
    profiles: (AllScanProfile | "secret-scan")[];
    authRef?: string;
  }) => void;
  readonly isOrchestratorScanning?: boolean;
  readonly orchestratorProgress?: {
    currentTask: string;
    completed: number;
    total: number;
  } | null;

  // Graph layout controls
  readonly layoutDirection?: "DOWN" | "RIGHT";
  readonly onLayoutDirectionChange?: (dir: "DOWN" | "RIGHT") => void;
  readonly graphViewMode?: "all" | "selected";
  readonly onGraphViewModeChange?: (mode: "all" | "selected") => void;
  readonly activeGraph?: GraphViewType;
  readonly onSelectGraph?: (graphId: GraphViewType) => void;
  readonly groupByFile?: boolean;
  readonly onToggleGroupByFile?: () => void;

  // Test-file filtering for the "Whole Code" architecture graphs -- test
  // suites often dominate a codebase's node count relative to app code.
  readonly hideTestFiles?: boolean;
  readonly onToggleHideTestFiles?: () => void;

  readonly findingCount?: number;
  readonly localCount?: number;
  readonly orchestratorCount?: number;

  // Analysis Pipeline Mode: 'bugs' (flaws only) vs 'full' (entire codebase architecture)
  readonly analysisPipelineMode?: "bugs" | "full";
  readonly onAnalysisPipelineModeChange?: (mode: "bugs" | "full") => void;

  // Left Sidebar (Primary Sidebar) toggle
  readonly isLeftSidebarOpen?: boolean;
  readonly onToggleLeftSidebar?: () => void;

  // Right Section (Auxiliary Bar) toggle
  readonly isRightSectionOpen?: boolean;
  readonly onToggleRightSection?: () => void;

  // Universal Quick Search trigger
  readonly onOpenSearch?: () => void;

  // Download the current scan as a report -- opens a preview before the
  // actual file save, regardless of which format was picked from the menu.
  readonly onDownloadReport?: (format: "md" | "pdf") => void;
}

const RECENT_FOLDERS_STORAGE_KEY = "whoami:recent_folders";

function getStoredRecentFolders(): string[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(RECENT_FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function saveStoredRecentFolders(folders: readonly string[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(RECENT_FOLDERS_STORAGE_KEY, JSON.stringify(folders.slice(0, 10)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Streamlined Single-Tier Header Component featuring:
 * 1. Mode-synchronized scan controls (Folder selector for Local, Target & Multi-task selector for Orchestrator)
 * 2. Graph controls (Single Graph View dropdown, Flow filters, Layout direction, Issues count)
 */
export function UnifiedScanHeader({
  scanMode = "local",
  onScanModeChange,
  currentFolderPath = "",
  recentFolders,
  onFolderChange,
  onBrowseFolder,
  onScanLocal,
  isLocalScanning = false,
  localProgress,
  onScanCloudSast,
  isCloudSastScanning = false,
  cloudSastProgress,
  defaultTarget = "scanme.nmap.org",
  onScanOrchestrator,
  isOrchestratorScanning = false,
  orchestratorProgress,
  layoutDirection = "DOWN",
  onLayoutDirectionChange,
  graphViewMode = "all",
  onGraphViewModeChange,
  activeGraph = "graph",
  onSelectGraph,
  findingCount = 0,
  analysisPipelineMode = "bugs",
  onAnalysisPipelineModeChange,
  isLeftSidebarOpen = true,
  onToggleLeftSidebar,
  isRightSectionOpen = false,
  onToggleRightSection,
  onOpenSearch,
  onDownloadReport,
  hideTestFiles,
  onToggleHideTestFiles,
}: UnifiedScanHeaderProps): React.ReactElement {
  const [activeMode, setActiveMode] = useState<ScanMode>(scanMode);

  // Local & Cloud folder state
  const [selectedFolder, setSelectedFolder] = useState<string>(currentFolderPath);
  const [internalRecentFolders, setInternalRecentFolders] = useState<string[]>(() => {
    if (recentFolders && recentFolders.length > 0) return [...recentFolders];
    return getStoredRecentFolders();
  });
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState<boolean>(false);

  // Cloud SAST state
  const [selectedSastTasks, setSelectedSastTasks] = useState<
    (AllScanProfile | "secret-scan")[]
  >(["sast-joern", "sast-semgrep", "sast-trufflehog"]);
  const [isSastDropdownOpen, setIsSastDropdownOpen] = useState<boolean>(false);
  const sastMenuRef = useRef<HTMLDivElement>(null);

  // Target DAST state
  const [target, setTarget] = useState<string>(defaultTarget);
  const [selectedTasks, setSelectedTasks] = useState<
    (AllScanProfile | "secret-scan")[]
  >(["recon", "web-discovery", "vuln-assessment"]);
  const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState<boolean>(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState<boolean>(false);
  const [isWholeCodeOpen, setIsWholeCodeOpen] = useState<boolean>(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState<boolean>(false);

  const folderMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const wholeCodeMenuRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [showLeftShadow, setShowLeftShadow] = useState<boolean>(false);
  const [showRightShadow, setShowRightShadow] = useState<boolean>(false);

  const closeAllDropdowns = useCallback(() => {
    setIsFolderDropdownOpen(false);
    setIsSastDropdownOpen(false);
    setIsTaskDropdownOpen(false);
    setIsLayoutMenuOpen(false);
    setIsWholeCodeOpen(false);
    setIsDownloadMenuOpen(false);
  }, []);

  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftShadow(scrollLeft > 2);
    setShowRightShadow(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  const getDropdownStyle = (
    ref: React.RefObject<HTMLDivElement | null>,
    align: "left" | "right" = "left",
    width = 288,
  ): React.CSSProperties => {
    if (typeof window === "undefined" || !ref.current) {
      return {
        position: "absolute",
        top: "100%",
        ...(align === "right" ? { right: 0 } : { left: 0 }),
        zIndex: 50,
      };
    }
    const rect = ref.current.getBoundingClientRect();
    const style: React.CSSProperties = {
      position: "fixed",
      top: rect.bottom + 4,
      zIndex: 100,
    };
    if (align === "right") {
      style.right = Math.max(8, window.innerWidth - rect.right);
    } else {
      style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    }
    return style;
  };

  const isLocal = activeMode === "local" || activeMode === "local-offline";
  const isCloudSast = activeMode === "cloud-sast";
  const isTargetDast = activeMode === "target-dast" || activeMode === "orchestrator";

  // Filter Whole Code graph options for active scanMode
  const availableWholeCodeOptions = React.useMemo(() => {
    return WHOLE_CODE_GRAPH_OPTIONS.filter((opt) => {
      if (!activeMode) return true;
      if (opt.scope === "both") return true;
      if (isTargetDast) return opt.scope === "orchestrator";
      return opt.scope === "local";
    });
  }, [activeMode, isTargetDast]);

  const isBugModeActive = activeGraph === "graph" || analysisPipelineMode === "bugs";
  const selectedWholeCodeOption =
    availableWholeCodeOptions.find((g) => g.id === activeGraph) ||
    availableWholeCodeOptions[0];

  // Update internal mode if prop changes
  useEffect(() => {
    setActiveMode(scanMode);
  }, [scanMode]);

  // Sync internal selectedFolder if prop changes
  useEffect(() => {
    if (currentFolderPath !== undefined) {
      setSelectedFolder(currentFolderPath);
    }
  }, [currentFolderPath]);

  // Sync internal recentFolders if prop changes
  useEffect(() => {
    if (recentFolders && recentFolders.length > 0) {
      setInternalRecentFolders([...recentFolders]);
    }
  }, [recentFolders]);

  const addFolderToRecent = (folder: string) => {
    if (!folder || !folder.trim()) return;
    const normalized = folder.trim();
    setInternalRecentFolders((prev) => {
      const updated = [normalized, ...prev.filter((f) => f !== normalized)].slice(0, 10);
      saveStoredRecentFolders(updated);
      return updated;
    });
  };

  const handleBrowseFolder = async () => {
    try {
      let chosenPath: string | null = null;
      if (onBrowseFolder) {
        const res = await onBrowseFolder();
        if (res) chosenPath = res;
      } else if (typeof window !== "undefined" && "showDirectoryPicker" in window) {
        try {
          const win = window as unknown as {
            showDirectoryPicker?: () => Promise<{ name?: string }>;
          };
          const dirHandle = await win.showDirectoryPicker?.();
          if (dirHandle?.name) {
            chosenPath = dirHandle.name;
          }
        } catch {
          // User cancelled file manager dialog
        }
      }

      if (chosenPath) {
        setSelectedFolder(chosenPath);
        onFolderChange?.(chosenPath);
        addFolderToRecent(chosenPath);
      }
    } catch (err) {
      console.warn("[WhoAmI] Failed to browse folder:", err);
    }
  };

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (
        folderMenuRef.current &&
        !folderMenuRef.current.contains(targetNode)
      ) {
        setIsFolderDropdownOpen(false);
      }
      if (sastMenuRef.current && !sastMenuRef.current.contains(targetNode)) {
        setIsSastDropdownOpen(false);
      }
      if (taskMenuRef.current && !taskMenuRef.current.contains(targetNode)) {
        setIsTaskDropdownOpen(false);
      }
      if (
        layoutMenuRef.current &&
        !layoutMenuRef.current.contains(targetNode)
      ) {
        setIsLayoutMenuOpen(false);
      }
      if (
        wholeCodeMenuRef.current &&
        !wholeCodeMenuRef.current.contains(targetNode)
      ) {
        setIsWholeCodeOpen(false);
      }
      if (
        downloadMenuRef.current &&
        !downloadMenuRef.current.contains(targetNode)
      ) {
        setIsDownloadMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    updateScrollState();
    const handleResize = () => {
      closeAllDropdowns();
      updateScrollState();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateScrollState, closeAllDropdowns]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
          if (e.cancelable) {
            e.preventDefault();
          }
          el.scrollLeft += e.deltaY;
        }
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [
    activeMode,
    currentFolderPath,
    scanMode,
    isLocalScanning,
    isCloudSastScanning,
    isOrchestratorScanning,
    updateScrollState,
  ]);

  const handleHeaderScroll = () => {
    closeAllDropdowns();
    updateScrollState();
  };

  const handleModeSwitch = (mode: ScanMode) => {
    setActiveMode(mode);
    onScanModeChange?.(mode);
  };

  const handleToggleSastTask = (taskId: AllScanProfile | "secret-scan") => {
    setSelectedSastTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  const handleToggleTask = (taskId: AllScanProfile | "secret-scan") => {
    setSelectedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };

  const handleSelectAllTasks = () => {
    setSelectedTasks(TARGET_DAST_TASKS.map((t) => t.id));
  };

  const handleClearAllTasks = () => {
    setSelectedTasks([]);
  };

  const handleTriggerLocalScan = () => {
    if (!selectedFolder.trim()) {
      void handleBrowseFolder();
      return;
    }
    addFolderToRecent(selectedFolder);
    onScanLocal?.(selectedFolder);
  };

  const handleTriggerCloudSastScan = () => {
    if (selectedSastTasks.length === 0) return;
    if (!selectedFolder.trim()) {
      void handleBrowseFolder();
      return;
    }
    addFolderToRecent(selectedFolder);
    if (onScanCloudSast) {
      onScanCloudSast({
        folderPath: selectedFolder,
        profiles: selectedSastTasks,
      });
    } else if (onScanOrchestrator) {
      onScanOrchestrator({
        target: selectedFolder,
        profiles: selectedSastTasks,
      });
    }
  };

  const handleTriggerOrchestratorScan = () => {
    if (selectedTasks.length === 0) return;
    onScanOrchestrator?.({
      target,
      profiles: selectedTasks,
    });
  };

  return (
    <header className="relative flex flex-col border-b border-vscode-border bg-vscode-header text-vscode-fg select-none shrink-0 font-sans shadow-md w-full min-w-0">
      {/* Left overflow shadow */}
      {showLeftShadow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-vscode-header via-vscode-header/80 to-transparent z-30 transition-opacity duration-200"
        />
      )}

      {/* Streamlined Unified Control Bar with horizontal scrolling */}
      <div
        ref={scrollContainerRef}
        onScroll={handleHeaderScroll}
        className="flex items-center justify-between px-3 py-2 gap-3 overflow-x-auto scrollbar-none min-w-0 w-full flex-nowrap"
      >
        {/* Left: Contextual Scan Inputs for active mode */}
        <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
          {/* Contextual Input Controls */}
          {isLocal ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-vscode-muted shrink-0">
                Directory:
              </span>

              {/* Folder Dropdown / Editable Combobox */}
              <div className="relative w-44 sm:w-60 max-w-[260px] shrink" ref={folderMenuRef}>
                <div className="flex items-center rounded-md border border-vscode-border bg-vscode-card focus-within:border-vscode-focus px-2 py-1 text-xs">
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    title="Browse folder in file manager…"
                    aria-label="Browse folder"
                    className="p-0.5 -ml-0.5 mr-1 text-severity-high hover:text-[#FFD700] hover:bg-vscode-border rounded transition-colors cursor-pointer shrink-0"
                  >
                    <FolderIcon size={14} />
                  </button>
                  <input
                    type="text"
                    value={selectedFolder}
                    onChange={(e) => {
                      setSelectedFolder(e.target.value);
                      onFolderChange?.(e.target.value);
                    }}
                    placeholder="Workspace folder…"
                    title={selectedFolder || "Workspace folder…"}
                    className="flex-1 min-w-0 bg-transparent text-vscode-fg outline-none font-mono text-xs placeholder-vscode-muted truncate"
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                    title="Select recent folder"
                    aria-label="Recent folders"
                    className="p-0.5 text-vscode-muted hover:text-white transition-colors cursor-pointer ml-1 shrink-0"
                  >
                    <ChevronDownIcon size={12} />
                  </button>
                </div>

                {/* Recent Folders Dropdown Menu */}
                {isFolderDropdownOpen && (
                  <div
                    style={getDropdownStyle(folderMenuRef, "left", 288)}
                    className="w-72 rounded-md border border-vscode-border bg-vscode-card p-1 shadow-2xl animate-in fade-in duration-100"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsFolderDropdownOpen(false);
                        void handleBrowseFolder();
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium text-severity-medium hover:bg-vscode-card-hover hover:text-vscode-fg cursor-pointer border-b border-vscode-border mb-1"
                    >
                      <FolderIcon size={13} className="text-severity-medium shrink-0" />
                      <span>Browse for folder…</span>
                    </button>

                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                      Recent Workspaces
                    </div>
                    {internalRecentFolders.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-xs text-vscode-muted italic">
                        No recent folders
                      </div>
                    ) : (
                      internalRecentFolders.map((folder, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedFolder(folder);
                            onFolderChange?.(folder);
                            setIsFolderDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono text-left truncate cursor-pointer ${
                            selectedFolder === folder
                              ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                              : "text-vscode-fg hover:bg-vscode-card-hover hover:text-vscode-fg"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FolderIcon size={12} className="text-severity-high shrink-0" />
                            <span className="truncate" title={folder}>{folder}</span>
                          </div>
                          {selectedFolder === folder && <CheckIcon size={12} className="text-white shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Local Scan Action Button */}
              <div className="flex items-center gap-2 shrink-0">
                {isLocalScanning && localProgress && (
                  <span className="text-xs font-mono text-severity-medium">
                    {localProgress.scanned}/{localProgress.total} files
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleTriggerLocalScan}
                  disabled={isLocalScanning}
                  aria-label="Scan Folder"
                  title={isLocalScanning ? "Scanning Folder… (Pause)" : "Scan Folder (100% Offline)"}
                  className="flex items-center justify-center rounded-md bg-vscode-primary hover:bg-vscode-primary-hover active:bg-vscode-primary-hover px-2.5 py-1.5 text-xs font-semibold text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isLocalScanning ? (
                    <PauseIcon size={14} className="text-white" />
                  ) : (
                    <RefreshCwIcon size={14} className="text-white" />
                  )}
                </button>
              </div>
            </div>
          ) : isCloudSast ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-vscode-muted shrink-0">
                Directory:
              </span>

              {/* Folder input for SAST */}
              <div className="relative w-44 sm:w-60 max-w-[260px] shrink" ref={folderMenuRef}>
                <div className="flex items-center rounded-md border border-vscode-border bg-vscode-card focus-within:border-vscode-focus px-2 py-1 text-xs">
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    title="Browse folder in file manager…"
                    aria-label="Browse folder"
                    className="p-0.5 -ml-0.5 mr-1 text-severity-medium hover:text-[#9cdcfe] hover:bg-vscode-border rounded transition-colors cursor-pointer shrink-0"
                  >
                    <FolderIcon size={14} />
                  </button>
                  <input
                    type="text"
                    value={selectedFolder}
                    onChange={(e) => {
                      setSelectedFolder(e.target.value);
                      onFolderChange?.(e.target.value);
                    }}
                    placeholder="Workspace path…"
                    title={selectedFolder || "Workspace path…"}
                    className="flex-1 min-w-0 bg-transparent text-vscode-fg outline-none font-mono text-xs placeholder-vscode-muted truncate"
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                    title="Select recent folder"
                    aria-label="Recent folders"
                    className="p-0.5 text-vscode-muted hover:text-white transition-colors cursor-pointer ml-1 shrink-0"
                  >
                    <ChevronDownIcon size={12} />
                  </button>
                </div>

                {/* Recent Folders Dropdown Menu */}
                {isFolderDropdownOpen && (
                  <div
                    style={getDropdownStyle(folderMenuRef, "left", 288)}
                    className="w-72 rounded-md border border-vscode-border bg-vscode-card p-1 shadow-2xl animate-in fade-in duration-100"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsFolderDropdownOpen(false);
                        void handleBrowseFolder();
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium text-severity-medium hover:bg-vscode-card-hover hover:text-vscode-fg cursor-pointer border-b border-vscode-border mb-1"
                    >
                      <FolderIcon size={13} className="text-severity-medium shrink-0" />
                      <span>Browse for folder…</span>
                    </button>

                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                      Recent Workspaces
                    </div>
                    {internalRecentFolders.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-xs text-vscode-muted italic">
                        No recent folders
                      </div>
                    ) : (
                      internalRecentFolders.map((folder, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedFolder(folder);
                            onFolderChange?.(folder);
                            setIsFolderDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono text-left truncate cursor-pointer ${
                            selectedFolder === folder
                              ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                              : "text-vscode-fg hover:bg-vscode-card-hover hover:text-vscode-fg"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FolderIcon size={12} className="text-severity-high shrink-0" />
                            <span className="truncate" title={folder}>{folder}</span>
                          </div>
                          {selectedFolder === folder && <CheckIcon size={12} className="text-white shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Cloud SAST Engine Dropdown */}
              <div className="relative min-w-[110px] max-w-[130px] shrink" ref={sastMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsSastDropdownOpen((prev) => !prev)}
                  className="flex items-center justify-between w-full rounded-md border border-vscode-border bg-vscode-card px-2 py-1 text-xs cursor-pointer hover:border-vscode-dim"
                >
                  <div className="flex items-center gap-1 truncate">
                    <ShieldCheckIcon size={13} className="text-severity-medium shrink-0" />
                    <span className="text-vscode-fg font-medium truncate text-xs">
                      {selectedSastTasks.length} SAST Active
                    </span>
                  </div>
                  <ChevronDownIcon size={12} className="text-vscode-muted ml-1 shrink-0" />
                </button>

                {isSastDropdownOpen && (
                  <div
                    style={getDropdownStyle(sastMenuRef, "left", 288)}
                    className="w-72 rounded-md border border-vscode-border bg-vscode-card p-2 shadow-2xl animate-in fade-in duration-100"
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-vscode-border">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                        Cloud SAST Engines
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {CLOUD_SAST_TASKS.map((task) => {
                        const isChecked = selectedSastTasks.includes(task.id);
                        return (
                          <label
                            key={task.id}
                            className="flex items-start gap-2 p-1.5 rounded hover:bg-vscode-card-hover transition-colors cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSastTask(task.id)}
                              className="mt-0.5 rounded border-vscode-border text-vscode-primary focus:ring-0 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-semibold ${
                                    isChecked ? "text-vscode-fg" : "text-vscode-muted"
                                  }`}
                                >
                                  {task.name}
                                </span>
                                <span className="rounded bg-vscode-header border border-vscode-border px-1 py-0.2 text-[9px] font-mono text-vscode-muted">
                                  {task.tool}
                                </span>
                              </div>
                              <span className="text-[10px] text-vscode-muted leading-tight">
                                {task.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Cloud SAST Action Button */}
              <div className="flex items-center gap-2 shrink-0">
                {isCloudSastScanning && cloudSastProgress && (
                  <span className="text-xs font-mono text-severity-medium">
                    {cloudSastProgress.currentTask}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleTriggerCloudSastScan}
                  disabled={isCloudSastScanning || selectedSastTasks.length === 0}
                  aria-label="Scan Cloud SAST"
                  title="Run Joern CPG, Semgrep & TruffleHog in Cloud"
                  className="flex items-center justify-center rounded-md bg-vscode-card-selected hover:bg-vscode-primary border border-vscode-focus/50 px-2.5 py-1.5 text-xs font-semibold text-severity-medium transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isCloudSastScanning ? (
                    <PauseIcon size={14} className="text-severity-medium" />
                  ) : (
                    <PlayIcon size={14} className="text-severity-medium" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-vscode-muted shrink-0">
                Target:
              </span>
              <div className="flex items-center w-36 sm:w-48 max-w-[200px] shrink rounded-md border border-vscode-border bg-vscode-card focus-within:border-vscode-focus px-2 py-1 text-xs">
                <RadioIcon size={13} className="text-severity-low shrink-0 mr-1.5" />
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="Host or IP (e.g. example.com)"
                  className="flex-1 min-w-0 bg-transparent text-vscode-fg outline-none font-mono text-xs placeholder-vscode-muted truncate"
                />
              </div>

              {/* Multi-Task Checkbox Dropdown Selector */}
              <div className="relative min-w-[110px] max-w-[130px] shrink" ref={taskMenuRef}>
                <div className="flex items-center justify-between rounded-md border border-vscode-border bg-vscode-card px-2 py-1 text-xs cursor-pointer hover:border-vscode-dim">
                  <button
                    type="button"
                    onClick={() => setIsTaskDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 text-left flex-1 truncate"
                  >
                    <TerminalIcon size={13} className="text-severity-low shrink-0" />
                    <span className="text-vscode-fg font-medium truncate text-xs">
                      {selectedTasks.length === 0
                        ? "Select Tasks…"
                        : `${selectedTasks.length} Tasks Active`}
                    </span>
                    <ChevronDownIcon size={12} className="text-vscode-muted ml-auto shrink-0" />
                  </button>
                </div>

                {/* Task Selection Dropdown with Checkboxes */}
                {isTaskDropdownOpen && (
                  <div
                    style={getDropdownStyle(taskMenuRef, "left", 288)}
                    className="w-72 rounded-md border border-vscode-border bg-vscode-card p-2 shadow-2xl animate-in fade-in duration-100"
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-vscode-border">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                        Scan Task Profiles
                      </span>
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={handleSelectAllTasks}
                          className="text-severity-medium hover:underline cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-vscode-border">|</span>
                        <button
                          type="button"
                          onClick={handleClearAllTasks}
                          className="text-vscode-muted hover:text-vscode-fg cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                      {TARGET_DAST_TASKS.map((task) => {
                        const isChecked = selectedTasks.includes(task.id);
                        return (
                          <label
                            key={task.id}
                            className="flex items-start gap-2 p-1.5 rounded hover:bg-vscode-card-hover transition-colors cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleTask(task.id)}
                              className="mt-0.5 rounded border-vscode-border text-vscode-primary focus:ring-0 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-semibold ${
                                    isChecked ? "text-vscode-fg" : "text-vscode-muted"
                                  }`}
                                >
                                  {task.name}
                                </span>
                                <span className="rounded bg-vscode-header border border-vscode-border px-1 py-0.2 text-[9px] font-mono text-vscode-muted">
                                  {task.tool}
                                </span>
                              </div>
                              <span className="text-[10px] text-vscode-muted leading-tight">
                                {task.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Orchestrator Action Button */}
              <div className="flex items-center gap-2 shrink-0">
                {isOrchestratorScanning && orchestratorProgress && (
                  <span className="text-xs font-mono text-severity-low">
                    {orchestratorProgress.currentTask} ({orchestratorProgress.completed}/{orchestratorProgress.total})
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleTriggerOrchestratorScan}
                  disabled={isOrchestratorScanning || selectedTasks.length === 0}
                  aria-label="Scan Target"
                  title={isOrchestratorScanning ? "Scanning Target… (Pause)" : "Scan Target"}
                  className="flex items-center justify-center rounded-md bg-[#107C41] hover:bg-[#0E6C38] active:bg-[#0A4D27] px-2.5 py-1.5 text-xs font-semibold text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isOrchestratorScanning ? (
                    <PauseIcon size={14} className="text-white" />
                  ) : (
                    <PlayIcon size={14} className="text-white" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Search Button, Bugs Focus Button, Architecture Options Dropdown, Flow Filter, and Right Section Toggle */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Universal Quick Search Button */}
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              title="Search files, folders, and issues (Cmd+K / Ctrl+K)"
              aria-label="Search files, folders, and issues"
              className="flex items-center gap-1.5 rounded-md border border-vscode-border bg-vscode-card hover:bg-vscode-card-hover hover:border-vscode-dim px-2 py-1 text-xs text-vscode-muted hover:text-vscode-fg transition-all shadow-sm cursor-pointer"
            >
              <SearchIcon size={12} className="text-severity-medium shrink-0" />
              <span className="text-xs hidden md:inline font-medium">Search…</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.2 text-[9px] font-mono text-vscode-muted bg-vscode-bg border border-vscode-btn-secondary rounded">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Integrated 2-Mode Switcher: Bug View vs Architecture Options */}
          <div className="flex items-center rounded-md border border-vscode-border bg-vscode-card p-0.5 shadow-sm">
            {/* 1. Bug & Vulnerability Mode Button */}
            <button
              type="button"
              onClick={() => {
                setIsWholeCodeOpen(false);
                onAnalysisPipelineModeChange?.("bugs");
                onSelectGraph?.("graph");
              }}
              title="Bugs & Vulnerability Analysis Pipeline (Focus View)"
              aria-label="Bugs & Vulnerabilities"
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all cursor-pointer ${
                isBugModeActive
                  ? "bg-vscode-primary text-white shadow-sm font-semibold"
                  : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover font-medium"
              }`}
            >
              <ShieldAlertIcon
                size={13}
                className={isBugModeActive ? "text-white" : "text-severity-critical"}
              />
              <span>Bugs</span>
              {findingCount !== undefined && findingCount > 0 && (
                <span className="rounded-full bg-severity-critical-bg border border-severity-critical/50 px-1.5 py-0.1 text-[9px] font-mono text-severity-critical font-bold">
                  {findingCount}
                </span>
              )}
            </button>

            {/* 2. Whole Code Analysis Options Dropdown Button */}
            <div className="relative" ref={wholeCodeMenuRef}>
              <button
                type="button"
                onClick={() => {
                  if (isBugModeActive) {
                    onAnalysisPipelineModeChange?.("full");
                    const targetGraph =
                      selectedWholeCodeOption?.id ||
                      (activeMode === "orchestrator" ? "remote" : "unified");
                    onSelectGraph?.(targetGraph);
                  }
                  setIsWholeCodeOpen((prev) => !prev);
                }}
                title="Full Codebase Architecture & Unified Pipeline"
                aria-label="Whole Code Architecture"
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all cursor-pointer ${
                  !isBugModeActive
                    ? "bg-vscode-primary text-white shadow-sm font-semibold"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover font-medium"
                }`}
              >
                <RadioIcon
                  size={13}
                  className={!isBugModeActive ? "text-white" : "text-[#4EC9B0]"}
                />
                <span className="text-xs truncate max-w-[80px] sm:max-w-[105px]">
                  {!isBugModeActive && selectedWholeCodeOption
                    ? selectedWholeCodeOption.category
                    : "Whole Code"}
                </span>
                <ChevronDownIcon
                  size={11}
                  className={`text-vscode-muted transition-transform duration-150 ${
                    isWholeCodeOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Whole Code Architecture Dropdown Menu */}
              {isWholeCodeOpen && (
                <div
                  style={getDropdownStyle(wholeCodeMenuRef, "right", 288)}
                  className="w-72 rounded-lg border border-vscode-border bg-vscode-bg p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 font-sans"
                >
                  <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-vscode-muted border-b border-vscode-card-hover flex items-center justify-between">
                    <span>
                      {activeMode === "orchestrator"
                        ? "Whole Target Architecture"
                        : "Whole Code Architecture Diagrams"}
                    </span>
                    <span className="font-mono text-[9px] text-vscode-dim">
                      ({availableWholeCodeOptions.length})
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5 py-1">
                    {availableWholeCodeOptions.map((option) => {
                      const isSelected = !isBugModeActive && option.id === activeGraph;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            onAnalysisPipelineModeChange?.("full");
                            onSelectGraph?.(option.id);
                            setIsWholeCodeOpen(false);
                          }}
                          className={`flex items-start gap-2 p-1.5 rounded text-left transition-all cursor-pointer ${
                            isSelected
                              ? "bg-vscode-card-selected/60 border border-vscode-focus/50 text-vscode-fg font-semibold"
                              : "text-vscode-fg hover:bg-vscode-card-hover border border-transparent"
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">{option.icon}</div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-semibold">{option.title}</span>
                              <span
                                className={`rounded border px-1 py-0.1 text-[9px] font-mono font-medium ${option.badgeColor}`}
                              >
                                {option.category}
                              </span>
                            </div>
                            <span className="text-[10px] text-vscode-muted leading-tight mt-0.5">
                              {option.subtitle}
                            </span>
                          </div>
                          {isSelected && (
                            <CheckIcon size={13} className="text-severity-medium shrink-0 mt-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Layout Direction section inside dropdown */}
                  <div className="border-t border-vscode-card-hover my-1" />
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
                    Layout Direction
                  </div>
                  <div className="flex gap-1 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        onLayoutDirectionChange?.("DOWN");
                        setIsWholeCodeOpen(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer ${
                        layoutDirection === "DOWN"
                          ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                          : "text-vscode-fg hover:bg-vscode-card-hover"
                      }`}
                    >
                      <RowsIcon size={12} className="text-severity-medium" />
                      <span>Top-to-Bottom</span>
                      {layoutDirection === "DOWN" && <CheckIcon size={11} className="text-vscode-focus" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onLayoutDirectionChange?.("RIGHT");
                        setIsWholeCodeOpen(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer ${
                        layoutDirection === "RIGHT"
                          ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                          : "text-vscode-fg hover:bg-vscode-card-hover"
                      }`}
                    >
                      <ColumnsIcon size={12} className="text-severity-medium" />
                      <span>Left-to-Right</span>
                      {layoutDirection === "RIGHT" && <CheckIcon size={11} className="text-vscode-focus" />}
                    </button>
                  </div>

                  {onToggleHideTestFiles && (
                    <>
                      <div className="border-t border-vscode-card-hover my-1" />
                      <button
                        type="button"
                        onClick={onToggleHideTestFiles}
                        title="Test suites often dominate a codebase's file count -- hide them to focus the architecture graph on application code"
                        className="flex w-full items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer text-vscode-fg hover:bg-vscode-card-hover"
                      >
                        <span>Hide test files</span>
                        <span
                          className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                            hideTestFiles ? "bg-vscode-focus" : "bg-vscode-btn-secondary"
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                              hideTestFiles ? "translate-x-3.5" : "translate-x-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Graph View Mode Filter (All vs Selected) - Compact */}
          <div className="flex items-center rounded border border-vscode-border bg-vscode-card p-0.5">
            <button
              type="button"
              onClick={() => onGraphViewModeChange?.("all")}
              title="All Flows"
              aria-label="All Flows"
              className={`p-1 rounded transition-colors cursor-pointer flex items-center justify-center ${
                graphViewMode === "all"
                  ? "bg-vscode-primary text-white shadow-sm"
                  : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
              }`}
            >
              <NetworkIcon size={13} />
            </button>
            <button
              type="button"
              onClick={() => onGraphViewModeChange?.("selected")}
              title="Selected Flow"
              aria-label="Selected Flow"
              className={`p-1 rounded transition-colors cursor-pointer flex items-center justify-center ${
                graphViewMode === "selected"
                  ? "bg-vscode-primary text-white shadow-sm"
                  : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
              }`}
            >
              <FocusIcon size={13} />
            </button>
          </div>


          {/* Layout Controls: Left (Primary) Side Bar & Right (Secondary) Section */}
          {(onToggleLeftSidebar || onToggleRightSection) && (
            <div className="flex items-center rounded border border-vscode-border bg-vscode-card p-0.5 gap-0.5">
              {onToggleLeftSidebar && (
                <button
                  type="button"
                  onClick={onToggleLeftSidebar}
                  title={isLeftSidebarOpen ? "Hide Primary Side Bar" : "Show Primary Side Bar"}
                  aria-label={isLeftSidebarOpen ? "Hide Primary Side Bar" : "Show Primary Side Bar"}
                  className={`flex items-center justify-center p-1 rounded transition-colors cursor-pointer ${
                    isLeftSidebarOpen
                      ? "bg-vscode-primary text-white shadow-sm"
                      : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                  }`}
                >
                  <PanelLeftIcon size={13} />
                </button>
              )}

              {onToggleRightSection && (
                <button
                  type="button"
                  onClick={onToggleRightSection}
                  title={isRightSectionOpen ? "Hide Right Section" : "Show Right Section"}
                  aria-label={isRightSectionOpen ? "Hide Right Section" : "Show Right Section"}
                  className={`flex items-center justify-center p-1 rounded transition-colors cursor-pointer ${
                    isRightSectionOpen
                      ? "bg-vscode-primary text-white shadow-sm"
                      : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                  }`}
                >
                  <PanelRightIcon size={13} />
                </button>
              )}

            </div>
          )}

          {/* Download Report: its own pill, separate from the sidebar/panel toggles */}
          {onDownloadReport && (
            <div className="relative" ref={downloadMenuRef}>
              <button
                type="button"
                onClick={() => setIsDownloadMenuOpen((prev) => !prev)}
                title="Download Scan Report"
                aria-label="Download Report"
                aria-expanded={isDownloadMenuOpen}
                className={`flex items-center gap-1 rounded border border-vscode-border p-1 transition-colors cursor-pointer ${
                  isDownloadMenuOpen
                    ? "bg-vscode-primary text-white shadow-sm border-vscode-primary"
                    : "bg-vscode-card text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <DownloadIcon size={13} />
              </button>

              {isDownloadMenuOpen && (
                <div
                  style={getDropdownStyle(downloadMenuRef, "right", 224)}
                  className="w-56 rounded-lg border border-vscode-border bg-vscode-bg p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 font-sans"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-vscode-dim">
                    Download Report
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      onDownloadReport("md");
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
                  >
                    <FileCodeIcon size={13} className="text-severity-medium" />
                    Markdown (.md)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      onDownloadReport("pdf");
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
                  >
                    <FileCodeIcon size={13} className="text-[#3FB950]" />
                    PDF document
                  </button>
                  <div className="mt-0.5 border-t border-vscode-border px-2 pt-1.5 text-[10px] text-vscode-dim">
                    Opens a preview before the file is saved.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right overflow shadow */}
      {showRightShadow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-vscode-header via-vscode-header/80 to-transparent z-30 transition-opacity duration-200"
        />
      )}
    </header>
  );
}
