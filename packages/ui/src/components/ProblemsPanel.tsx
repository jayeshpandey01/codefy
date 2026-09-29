import React, { useState, useMemo } from "react";
import type { Finding } from "@whoami/types";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  PointOnGraphIcon,
  SearchIcon,
  WandIcon,
  XIcon,
} from "./Icons.js";
import { DiffPreviewModal } from "./DiffPreviewModal.js";

export interface ProblemsPanelProps {
  findings: readonly Finding[];
  selectedFindingId?: string;
  onSelectFinding?: (finding: Finding) => void;
  onJumpToLine?: (filePath: string, line: number) => void;
  onFocusOnGraph?: (finding: Finding) => void;
  onApplyFix?: (finding: Finding) => Promise<boolean | void> | void;
  activeTab?: "problems" | "output" | "terminal";
  onSelectTab?: (tab: "problems" | "output" | "terminal") => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  height?: number;
  onResizeHeight?: (newHeight: number) => void;
}

const SEVERITY_DOT: Record<string, { color: string; label: string }> = {
  critical: { color: "#F14C4C", label: "Critical" },
  high: { color: "#CCA700", label: "High" },
  medium: { color: "#75BEFF", label: "Medium" },
  low: { color: "#89D185", label: "Low" },
};

export function ProblemsPanel({
  findings,
  selectedFindingId,
  onSelectFinding,
  onJumpToLine,
  onFocusOnGraph,
  onApplyFix,
  activeTab = "problems",
  onSelectTab,
  isCollapsed = false,
  onToggleCollapse,
  height = 240,
}: ProblemsPanelProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState("");
  const [diffFinding, setDiffFinding] = useState<Finding | null>(null);

  const filteredFindings = useMemo(() => {
    if (!searchQuery.trim()) return findings;
    const q = searchQuery.toLowerCase();
    return findings.filter((f) => {
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchDesc = (f.description || "").toLowerCase().includes(q);
      const matchRule = f.ruleId.toLowerCase().includes(q);
      const matchFile = f.trace.steps.some((s) =>
        s.filePath.toLowerCase().includes(q),
      );
      return matchTitle || matchDesc || matchRule || matchFile;
    });
  }, [findings, searchQuery]);

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-between border-t border-vscode-border bg-vscode-card px-4 py-1 text-xs text-vscode-fg select-none shrink-0 font-sans">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 rounded px-2 py-0.5 font-medium hover:bg-vscode-card-hover transition cursor-pointer text-vscode-fg"
          >
            <ChevronUpIcon size={12} />
            <span className="font-semibold uppercase text-[11px] tracking-wider">
              Problems ({findings.length})
            </span>
          </button>
        </div>
        <span className="text-[11px] text-vscode-muted">Click to expand</span>
      </div>
    );
  }

  return (
    <div
      style={{ height: `${height}px` }}
      className="flex flex-col border-t border-vscode-border bg-vscode-card text-vscode-fg select-none shrink-0 font-sans shadow-lg"
    >
      {/* Panel Tabs & Filter Header */}
      <div className="flex items-center justify-between border-b border-vscode-border bg-vscode-header px-3 py-1.5 text-xs shrink-0">
        {/* Left Tabs */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onSelectTab?.("problems")}
            className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === "problems"
                ? "text-severity-medium border-b-2 border-vscode-focus pb-0.5"
                : "text-vscode-muted hover:text-vscode-fg"
            }`}
          >
            <span>Problems</span>
            <span className="text-[10px] text-vscode-muted">
              ({findings.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab?.("output")}
            className={`text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === "output"
                ? "text-severity-medium border-b-2 border-vscode-focus pb-0.5"
                : "text-vscode-muted hover:text-vscode-fg"
            }`}
          >
            <span>Output</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab?.("terminal")}
            className={`text-[11px] font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === "terminal"
                ? "text-severity-medium border-b-2 border-vscode-focus pb-0.5"
                : "text-vscode-muted hover:text-vscode-fg"
            }`}
          >
            <span>Terminal</span>
          </button>
        </div>

        {/* Right Search Filter & Collapse */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center w-60">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter (e.g. text, **/*.ts)"
              className="w-full rounded border border-vscode-border bg-vscode-border py-0.5 pl-2 pr-6 text-xs text-vscode-fg placeholder-vscode-muted focus:border-vscode-focus focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 text-vscode-muted hover:text-vscode-fg cursor-pointer"
              >
                <XIcon size={11} />
              </button>
            ) : (
              <SearchIcon
                size={11}
                className="absolute right-2 text-vscode-muted"
              />
            )}
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse Panel"
              className="p-1 text-vscode-muted hover:text-vscode-fg rounded-md hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-all duration-150 cursor-pointer"
            >
              <ChevronDownIcon size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Problems Data Table */}
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-vscode-bg">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-vscode-border bg-vscode-card text-[10px] font-bold uppercase tracking-wider text-vscode-muted">
              <th className="py-1.5 px-3 w-28">Severity</th>
              <th className="py-1.5 px-3 w-40">Type</th>
              <th className="py-1.5 px-3">Description</th>
              <th className="py-1.5 px-3 w-24">Location</th>
              <th className="py-1.5 px-3 w-36">File</th>
              <th className="py-1.5 px-3 w-28 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-xs text-vscode-muted"
                >
                  {findings.length === 0
                    ? "No problems detected in workspace."
                    : "No problems match the filter criteria."}
                </td>
              </tr>
            ) : (
              filteredFindings.map((finding) => {
                const isSelected = selectedFindingId === finding.id;
                const sev = SEVERITY_DOT[finding.severity] ?? SEVERITY_DOT.low!;
                const primaryStep =
                  finding.trace.steps[finding.trace.steps.length - 1] ||
                  finding.trace.steps[0];
                const fileBasename = primaryStep
                  ? primaryStep.filePath.split(/[/\\]/).pop() ||
                    primaryStep.filePath
                  : "";
                const ruleTypeSlug = finding.ruleId.replace("js-", "");

                return (
                  <tr
                    key={finding.id}
                    onClick={() => onSelectFinding?.(finding)}
                    className={`border-b border-vscode-border/60 transition cursor-pointer ${
                      isSelected
                        ? "bg-vscode-card-selected text-vscode-fg font-semibold"
                        : "hover:bg-vscode-card-hover"
                    }`}
                  >
                    {/* Severity */}
                    <td className="py-1.5 px-3">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: sev.color }}
                        />
                        <span style={{ color: sev.color }}>{sev.label}</span>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="py-1.5 px-3 font-mono text-[11px] text-vscode-fg">
                      {ruleTypeSlug}
                    </td>

                    {/* Description */}
                    <td className="py-1.5 px-3 text-vscode-fg max-w-md truncate">
                      {finding.title}
                    </td>

                    {/* Location */}
                    <td className="py-1.5 px-3 font-mono text-[11px] text-vscode-muted">
                      {primaryStep ? `Line ${primaryStep.line}` : "-"}
                    </td>

                    {/* File */}
                    <td className="py-1.5 px-3 font-mono text-[11px] text-vscode-muted truncate">
                      {fileBasename}
                    </td>

                    {/* Action */}
                    <td className="py-1.5 px-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {primaryStep && onJumpToLine && (
                          <button
                            type="button"
                            onClick={() =>
                              onJumpToLine(
                                primaryStep.filePath,
                                primaryStep.line,
                              )
                            }
                            title="Jump to code line in editor"
                            className="p-1 text-vscode-muted hover:text-severity-medium rounded-md hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-all duration-150 cursor-pointer"
                          >
                            <ExternalLinkIcon size={12} />
                          </button>
                        )}
                        {onFocusOnGraph && (
                          <button
                            type="button"
                            onClick={() => onFocusOnGraph(finding)}
                            title="Highlight in Graph"
                            className="p-1 text-vscode-muted hover:text-severity-medium rounded-md hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-all duration-150 cursor-pointer"
                          >
                            <PointOnGraphIcon size={12} />
                          </button>
                        )}
                        {onApplyFix && (
                          <button
                            type="button"
                            onClick={() => setDiffFinding(finding)}
                            title="Preview and Apply Suggested Fix"
                            className="p-1 text-vscode-muted hover:text-severity-low rounded-md hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-all duration-150 cursor-pointer"
                          >
                            <WandIcon size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Diff Preview Modal */}
      {diffFinding && (
        <DiffPreviewModal
          finding={diffFinding}
          isOpen={Boolean(diffFinding)}
          onClose={() => setDiffFinding(null)}
          onApplyFix={async (f) => {
            await onApplyFix?.(f);
            setDiffFinding(null);
          }}
        />
      )}
    </div>
  );
}
