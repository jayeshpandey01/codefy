import React, { useState, useRef, useEffect } from "react";
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
  FocusIcon,
  FolderIcon,
  MenuIcon,
  NetworkIcon,
  PanelRightIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  RefreshCwIcon,
  RowsIcon,
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
];

export const TARGET_DAST_TASKS: ScanProfileOption[] = [
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
    id: "vuln-assessment",
    name: "Vuln Assessment",
    desc: "Targeted vulnerability templates",
    tool: "nuclei",
  },
  {
    id: "content-discovery",
    name: "Content Discovery",
    desc: "Directory fuzzing & exposed files",
    tool: "ffuf",
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

  readonly findingCount?: number;
  readonly localCount?: number;
  readonly orchestratorCount?: number;

  // Analysis Pipeline Mode: 'bugs' (flaws only) vs 'full' (entire codebase architecture)
  readonly analysisPipelineMode?: "bugs" | "full";
  readonly onAnalysisPipelineModeChange?: (mode: "bugs" | "full") => void;

  // Right Section (Auxiliary Bar) toggle
  readonly isRightSectionOpen?: boolean;
  readonly onToggleRightSection?: () => void;
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
  defaultTarget = "api.target.internal",
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
  isRightSectionOpen = false,
  onToggleRightSection,
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

  const folderMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const wholeCodeMenuRef = useRef<HTMLDivElement>(null);

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
          const dirHandle = await (window as any).showDirectoryPicker();
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
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
    <div className="flex flex-col border-b border-[#303031] bg-[#181818] text-[#D4D4D4] select-none shrink-0 font-sans shadow-md">
      {/* Streamlined Unified Control Bar */}
      <div className="flex items-center justify-between px-3 py-2 gap-3 flex-wrap sm:flex-nowrap">
        {/* Left: Contextual Scan Inputs for active mode */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
          {/* Contextual Input Controls */}
          {isLocal ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#858585] shrink-0">
                Directory:
              </span>

              {/* Folder Dropdown / Editable Combobox */}
              <div className="relative w-44 sm:w-60 max-w-[260px] shrink" ref={folderMenuRef}>
                <div className="flex items-center rounded-md border border-[#3C3C3C] bg-[#252526] focus-within:border-[#007ACC] px-2 py-1 text-xs">
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    title="Browse folder in file manager…"
                    aria-label="Browse folder"
                    className="p-0.5 -ml-0.5 mr-1 text-[#CCA700] hover:text-[#FFD700] hover:bg-[#333333] rounded transition-colors cursor-pointer shrink-0"
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
                    className="flex-1 min-w-0 bg-transparent text-[#E0E0E0] outline-none font-mono text-xs placeholder-[#666666] truncate"
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                    title="Select recent folder"
                    aria-label="Recent folders"
                    className="p-0.5 text-[#858585] hover:text-white transition-colors cursor-pointer ml-1 shrink-0"
                  >
                    <ChevronDownIcon size={12} />
                  </button>
                </div>

                {/* Recent Folders Dropdown Menu */}
                {isFolderDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md border border-[#3C3C3C] bg-[#252526] p-1 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFolderDropdownOpen(false);
                        void handleBrowseFolder();
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium text-[#75BEFF] hover:bg-[#2A2D2E] hover:text-white cursor-pointer border-b border-[#383838] mb-1"
                    >
                      <FolderIcon size={13} className="text-[#75BEFF] shrink-0" />
                      <span>Browse for folder…</span>
                    </button>

                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#858585]">
                      Recent Workspaces
                    </div>
                    {internalRecentFolders.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-xs text-[#858585] italic">
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
                              ? "bg-[#094771] text-white font-medium"
                              : "text-[#CCCCCC] hover:bg-[#2A2D2E] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FolderIcon size={12} className="text-[#CCA700] shrink-0" />
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
                  <span className="text-xs font-mono text-[#75BEFF]">
                    {localProgress.scanned}/{localProgress.total} files
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleTriggerLocalScan}
                  disabled={isLocalScanning}
                  aria-label="Scan Folder"
                  title={isLocalScanning ? "Scanning Folder… (Pause)" : "Scan Folder (100% Offline)"}
                  className="flex items-center justify-center rounded-md bg-[#0E639C] hover:bg-[#1177BB] active:bg-[#094771] px-2.5 py-1.5 text-xs font-semibold text-white transition-all shadow-md cursor-pointer disabled:opacity-50"
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
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#858585] shrink-0">
                Directory:
              </span>

              {/* Folder input for SAST */}
              <div className="relative w-44 sm:w-60 max-w-[260px] shrink" ref={folderMenuRef}>
                <div className="flex items-center rounded-md border border-[#3C3C3C] bg-[#252526] focus-within:border-[#007ACC] px-2 py-1 text-xs">
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    title="Browse folder in file manager…"
                    aria-label="Browse folder"
                    className="p-0.5 -ml-0.5 mr-1 text-[#75BEFF] hover:text-[#9cdcfe] hover:bg-[#333333] rounded transition-colors cursor-pointer shrink-0"
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
                    className="flex-1 min-w-0 bg-transparent text-[#E0E0E0] outline-none font-mono text-xs placeholder-[#666666] truncate"
                  />
                  <button
                    type="button"
                    onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                    title="Select recent folder"
                    aria-label="Recent folders"
                    className="p-0.5 text-[#858585] hover:text-white transition-colors cursor-pointer ml-1 shrink-0"
                  >
                    <ChevronDownIcon size={12} />
                  </button>
                </div>

                {/* Recent Folders Dropdown Menu */}
                {isFolderDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md border border-[#3C3C3C] bg-[#252526] p-1 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFolderDropdownOpen(false);
                        void handleBrowseFolder();
                      }}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 rounded text-xs font-medium text-[#75BEFF] hover:bg-[#2A2D2E] hover:text-white cursor-pointer border-b border-[#383838] mb-1"
                    >
                      <FolderIcon size={13} className="text-[#75BEFF] shrink-0" />
                      <span>Browse for folder…</span>
                    </button>

                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#858585]">
                      Recent Workspaces
                    </div>
                    {internalRecentFolders.length === 0 ? (
                      <div className="px-2.5 py-1.5 text-xs text-[#858585] italic">
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
                              ? "bg-[#094771] text-white font-medium"
                              : "text-[#CCCCCC] hover:bg-[#2A2D2E] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FolderIcon size={12} className="text-[#CCA700] shrink-0" />
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
                  className="flex items-center justify-between w-full rounded-md border border-[#3C3C3C] bg-[#252526] px-2 py-1 text-xs cursor-pointer hover:border-[#555555]"
                >
                  <div className="flex items-center gap-1 truncate">
                    <ShieldCheckIcon size={13} className="text-[#75BEFF] shrink-0" />
                    <span className="text-[#E0E0E0] font-medium truncate text-xs">
                      {selectedSastTasks.length} SAST Active
                    </span>
                  </div>
                  <ChevronDownIcon size={12} className="text-[#858585] ml-1 shrink-0" />
                </button>

                {isSastDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md border border-[#3C3C3C] bg-[#252526] p-2 shadow-2xl">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#303031]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#858585]">
                        Cloud SAST Engines
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      {CLOUD_SAST_TASKS.map((task) => {
                        const isChecked = selectedSastTasks.includes(task.id);
                        return (
                          <label
                            key={task.id}
                            className="flex items-start gap-2 p-1.5 rounded hover:bg-[#2A2D2E] transition-colors cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSastTask(task.id)}
                              className="mt-0.5 rounded border-[#3C3C3C] text-[#0E639C] focus:ring-0 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-semibold ${
                                    isChecked ? "text-[#E0E0E0]" : "text-[#858585]"
                                  }`}
                                >
                                  {task.name}
                                </span>
                                <span className="rounded bg-[#181818] border border-[#303031] px-1 py-0.2 text-[9px] font-mono text-[#858585]">
                                  {task.tool}
                                </span>
                              </div>
                              <span className="text-[10px] text-[#858585] leading-tight">
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
                  <span className="text-xs font-mono text-[#75BEFF]">
                    {cloudSastProgress.currentTask}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleTriggerCloudSastScan}
                  disabled={isCloudSastScanning || selectedSastTasks.length === 0}
                  aria-label="Scan Cloud SAST"
                  title="Run Joern CPG, Semgrep & TruffleHog in Cloud"
                  className="flex items-center justify-center rounded-md bg-[#094771] hover:bg-[#0E639C] border border-[#007ACC]/50 px-2.5 py-1.5 text-xs font-semibold text-[#75BEFF] transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isCloudSastScanning ? (
                    <PauseIcon size={14} className="text-[#75BEFF]" />
                  ) : (
                    <PlayIcon size={14} className="text-[#75BEFF]" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#858585] shrink-0">
                Target:
              </span>
              <div className="flex items-center w-36 sm:w-48 max-w-[200px] shrink rounded-md border border-[#3C3C3C] bg-[#252526] focus-within:border-[#007ACC] px-2 py-1 text-xs">
                <RadioIcon size={13} className="text-[#89D185] shrink-0 mr-1.5" />
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="Host or IP (e.g. example.com)"
                  className="flex-1 min-w-0 bg-transparent text-[#E0E0E0] outline-none font-mono text-xs placeholder-[#666666] truncate"
                />
              </div>

              {/* Multi-Task Checkbox Dropdown Selector */}
              <div className="relative min-w-[110px] max-w-[130px] shrink" ref={taskMenuRef}>
                <div className="flex items-center justify-between rounded-md border border-[#3C3C3C] bg-[#252526] px-2 py-1 text-xs cursor-pointer hover:border-[#555555]">
                  <button
                    type="button"
                    onClick={() => setIsTaskDropdownOpen((prev) => !prev)}
                    className="flex items-center gap-1.5 text-left flex-1 truncate"
                  >
                    <TerminalIcon size={13} className="text-[#89D185] shrink-0" />
                    <span className="text-[#E0E0E0] font-medium truncate text-xs">
                      {selectedTasks.length === 0
                        ? "Select Tasks…"
                        : `${selectedTasks.length} Tasks Active`}
                    </span>
                    <ChevronDownIcon size={12} className="text-[#858585] ml-auto shrink-0" />
                  </button>
                </div>

                {/* Task Selection Dropdown with Checkboxes */}
                {isTaskDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md border border-[#3C3C3C] bg-[#252526] p-2 shadow-2xl">
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#303031]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#858585]">
                        Scan Task Profiles
                      </span>
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={handleSelectAllTasks}
                          className="text-[#75BEFF] hover:underline cursor-pointer"
                        >
                          All
                        </button>
                        <span className="text-[#444444]">|</span>
                        <button
                          type="button"
                          onClick={handleClearAllTasks}
                          className="text-[#858585] hover:text-[#CCCCCC] cursor-pointer"
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
                            className="flex items-start gap-2 p-1.5 rounded hover:bg-[#2A2D2E] transition-colors cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleTask(task.id)}
                              className="mt-0.5 rounded border-[#3C3C3C] text-[#0E639C] focus:ring-0 cursor-pointer"
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-semibold ${
                                    isChecked ? "text-[#E0E0E0]" : "text-[#858585]"
                                  }`}
                                >
                                  {task.name}
                                </span>
                                <span className="rounded bg-[#181818] border border-[#303031] px-1 py-0.2 text-[9px] font-mono text-[#858585]">
                                  {task.tool}
                                </span>
                              </div>
                              <span className="text-[10px] text-[#858585] leading-tight">
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
                  <span className="text-xs font-mono text-[#89D185]">
                    {orchestratorProgress.currentTask} ({orchestratorProgress.completed}/{orchestratorProgress.total})
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleTriggerOrchestratorScan}
                  disabled={isOrchestratorScanning || selectedTasks.length === 0}
                  aria-label="Scan Target"
                  title={isOrchestratorScanning ? "Scanning Target… (Pause)" : "Scan Target"}
                  className="flex items-center justify-center rounded-md bg-[#16301A] hover:bg-[#1E3B20] border border-[#4EC9B0]/50 active:bg-[#112414] px-2.5 py-1.5 text-xs font-semibold text-[#89D185] transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isOrchestratorScanning ? (
                    <PauseIcon size={14} className="text-[#89D185]" />
                  ) : (
                    <PlayIcon size={14} className="text-[#89D185]" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Bugs Focus Button, Architecture Options Dropdown, Flow Filter, and Right Section Toggle */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {/* Integrated 2-Mode Switcher: Bug View vs Architecture Options */}
          <div className="flex items-center rounded-md border border-[#3C3C3C] bg-[#252526] p-0.5 shadow-sm">
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
                  ? "bg-[#0E639C] text-white shadow-sm font-semibold"
                  : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E] font-medium"
              }`}
            >
              <ShieldAlertIcon
                size={13}
                className={isBugModeActive ? "text-white" : "text-[#F14C4C]"}
              />
              <span>Bugs</span>
              {findingCount !== undefined && findingCount > 0 && (
                <span className="rounded-full bg-[#3B1212] border border-[#F14C4C]/50 px-1.5 py-0.1 text-[9px] font-mono text-[#F14C4C] font-bold">
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
                    ? "bg-[#0E639C] text-white shadow-sm font-semibold"
                    : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E] font-medium"
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
                  className={`text-[#858585] transition-transform duration-150 ${
                    isWholeCodeOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Whole Code Architecture Dropdown Menu */}
              {isWholeCodeOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 w-72 rounded-lg border border-[#3C3C3C] bg-[#1E1E1E] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 font-sans">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#858585] border-b border-[#2A2A2B] flex items-center justify-between">
                    <span>
                      {activeMode === "orchestrator"
                        ? "Whole Target Architecture"
                        : "Whole Code Architecture Diagrams"}
                    </span>
                    <span className="font-mono text-[9px] text-[#6E6E6E]">
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
                              ? "bg-[#094771]/60 border border-[#007ACC]/50 text-white"
                              : "text-[#CCCCCC] hover:bg-[#2A2D2E] hover:text-white border border-transparent"
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
                            <span className="text-[10px] text-[#858585] leading-tight mt-0.5">
                              {option.subtitle}
                            </span>
                          </div>
                          {isSelected && (
                            <CheckIcon size={13} className="text-[#75BEFF] shrink-0 mt-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Layout Direction section inside dropdown */}
                  <div className="border-t border-[#2A2A2B] my-1" />
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#858585]">
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
                          ? "bg-[#094771] text-white font-medium"
                          : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                      }`}
                    >
                      <RowsIcon size={12} className="text-[#75BEFF]" />
                      <span>Top-to-Bottom</span>
                      {layoutDirection === "DOWN" && <CheckIcon size={11} className="text-white" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onLayoutDirectionChange?.("RIGHT");
                        setIsWholeCodeOpen(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer ${
                        layoutDirection === "RIGHT"
                          ? "bg-[#094771] text-white font-medium"
                          : "text-[#CCCCCC] hover:bg-[#2A2D2E]"
                      }`}
                    >
                      <ColumnsIcon size={12} className="text-[#75BEFF]" />
                      <span>Left-to-Right</span>
                      {layoutDirection === "RIGHT" && <CheckIcon size={11} className="text-white" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Graph View Mode Filter (All vs Selected) - Compact */}
          <div className="flex items-center rounded border border-[#3C3C3C] bg-[#252526] p-0.5">
            <button
              type="button"
              onClick={() => onGraphViewModeChange?.("all")}
              title="All Flows"
              aria-label="All Flows"
              className={`p-1 rounded transition-colors cursor-pointer flex items-center justify-center ${
                graphViewMode === "all"
                  ? "bg-[#0E639C] text-white shadow-sm"
                  : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E]"
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
                  ? "bg-[#0E639C] text-white shadow-sm"
                  : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E]"
              }`}
            >
              <FocusIcon size={13} />
            </button>
          </div>

          {/* Right Section / Secondary Sidebar Toggle Button */}
          {onToggleRightSection && (
            <button
              type="button"
              onClick={onToggleRightSection}
              title={isRightSectionOpen ? "Hide Right Section" : "Show Right Section"}
              aria-label={isRightSectionOpen ? "Hide Right Section" : "Show Right Section"}
              className={`flex items-center justify-center p-1.5 rounded border border-[#3C3C3C] transition-colors cursor-pointer ${
                isRightSectionOpen
                  ? "bg-[#0E639C] text-white shadow-sm border-[#007ACC]"
                  : "bg-[#252526] text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E]"
              }`}
            >
              <PanelRightIcon size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
