import React, { useState, useRef, useEffect } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  DatabaseIcon,
  DiamondIcon,
  FileCodeIcon,
  FolderIcon,
  LockIcon,
  RadioIcon,
  RemoteScanIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "./Icons.js";

export type GraphViewType =
  | "graph"
  | "unified"
  | "blast_radius"
  | "control_flow"
  | "supply_chain"
  | "remote";

export type GraphScope = "local" | "orchestrator" | "both";

export interface GraphOption {
  readonly id: GraphViewType;
  readonly title: string;
  readonly subtitle: string;
  readonly category: string;
  readonly icon: React.ReactNode;
  readonly badgeColor: string;
  readonly scope: GraphScope;
}

export const GRAPH_OPTIONS: readonly GraphOption[] = [
  {
    id: "graph",
    title: "Data Flow DAG",
    subtitle: "Interconnected tainted sources, sanitizers, and vulnerability sinks",
    category: "Taint Analysis",
    icon: <ShieldCheckIcon size={14} className="text-severity-medium" />,
    badgeColor: "bg-vscode-card-selected text-severity-medium border-vscode-focus/40",
    scope: "local",
  },
  {
    id: "unified",
    title: "Unified Architecture + Taint",
    subtitle: "Codebase structure blended with data flow attack paths",
    category: "Unified DAG",
    icon: <RadioIcon size={14} className="text-[#4EC9B0]" />,
    badgeColor: "bg-[#09352F] text-[#4EC9B0] border-[#4EC9B0]/40",
    scope: "local",
  },
  {
    id: "control_flow",
    title: "Control Flow & Decision Gates",
    subtitle: "Branching conditions, safe exits, and bypass exploit vectors",
    category: "Control Flow",
    icon: <DiamondIcon size={14} className="text-[#FFD700]" />,
    badgeColor: "bg-severity-high-bg text-[#FFD700] border-severity-high/40",
    scope: "local",
  },
  {
    id: "supply_chain",
    title: "Supply Chain & Dependencies",
    subtitle: "Third-party packages & module import chains to source files",
    category: "Supply Chain",
    icon: <FileCodeIcon size={14} className="text-[#4EC9B0]" />,
    badgeColor: "bg-[#09352F] text-[#4EC9B0] border-[#4EC9B0]/40",
    scope: "local",
  },
  {
    id: "blast_radius",
    title: "Threat Model & Blast Radius",
    subtitle: "Trust boundary zones & critical asset impact reachability",
    category: "Threat Model",
    icon: <ShieldAlertIcon size={14} className="text-severity-critical" />,
    badgeColor: "bg-severity-critical-bg text-severity-critical border-severity-critical/40",
    scope: "both",
  },
  {
    id: "remote",
    title: "Remote Attack Surface",
    subtitle: "Dynamic endpoint mapping & live orchestrator recon topology",
    category: "Orchestrator",
    icon: <RemoteScanIcon size={14} className="text-severity-low" />,
    badgeColor: "bg-[#16301A] text-severity-low border-[#4EC9B0]/40",
    scope: "orchestrator",
  },
];

export const WHOLE_CODE_GRAPH_OPTIONS: readonly GraphOption[] = GRAPH_OPTIONS.filter(
  (opt) => opt.id !== "graph",
);

export interface GraphSelectorDropdownProps {
  readonly activeGraph?: GraphViewType;
  readonly onSelectGraph?: (graphId: GraphViewType) => void;
  readonly findingCount?: number;
  readonly scanMode?: "local" | "orchestrator";
}

export function GraphSelectorDropdown({
  activeGraph = "graph",
  onSelectGraph,
  findingCount,
  scanMode = "local",
}: GraphSelectorDropdownProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableOptions = React.useMemo(() => {
    if (!scanMode) return GRAPH_OPTIONS;
    return GRAPH_OPTIONS.filter(
      (opt) => opt.scope === scanMode || opt.scope === "both",
    );
  }, [scanMode]);

  const selectedOption =
    availableOptions.find((g) => g.id === activeGraph) ||
    GRAPH_OPTIONS.find((g) => g.id === activeGraph) ||
    availableOptions[0] ||
    GRAPH_OPTIONS[0]!;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-vscode-border bg-vscode-card hover:bg-[#2F2F30] hover:border-vscode-dim px-2.5 py-1 text-xs font-semibold text-vscode-fg transition-all shadow-sm cursor-pointer"
        title="Switch Graph View"
      >
        <span className="shrink-0">{selectedOption.icon}</span>
        <span className="truncate max-w-[140px] sm:max-w-[180px] font-sans">
          {selectedOption.title}
        </span>
        {findingCount !== undefined && findingCount > 0 && selectedOption.id === "graph" && (
          <span className="rounded-full bg-severity-critical-bg border border-severity-critical/40 px-1.5 py-0.2 text-[10px] font-mono text-severity-critical font-bold">
            {findingCount}
          </span>
        )}
        <ChevronDownIcon
          size={12}
          className={`text-vscode-muted transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 sm:left-0 top-full mt-1.5 z-50 w-80 rounded-lg border border-vscode-border bg-vscode-bg p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 font-sans">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-vscode-muted border-b border-vscode-card-hover flex items-center justify-between">
            <span>
              {scanMode === "orchestrator"
                ? "Orchestrator Recon Diagrams"
                : "Local Analysis Diagrams"}
            </span>
            <span className="font-mono text-[9px] text-vscode-dim">
              ({availableOptions.length})
            </span>
          </div>

          <div className="flex flex-col gap-1 py-1">
            {availableOptions.map((option) => {
              const isSelected = option.id === activeGraph;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelectGraph?.(option.id);
                    setIsOpen(false);
                  }}
                  className={`flex items-start gap-2.5 p-2 rounded-md text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-vscode-card-selected/60 border border-vscode-focus/50 text-vscode-fg font-semibold"
                      : "text-vscode-fg hover:bg-vscode-card-hover hover:text-vscode-fg border border-transparent"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{option.icon}</div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold">{option.title}</span>
                      <span
                        className={`rounded border px-1.5 py-0.2 text-[9px] font-mono font-medium ${option.badgeColor}`}
                      >
                        {option.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-vscode-muted leading-tight mt-0.5">
                      {option.subtitle}
                    </span>
                  </div>
                  {isSelected && (
                    <CheckIcon size={14} className="text-severity-medium shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
