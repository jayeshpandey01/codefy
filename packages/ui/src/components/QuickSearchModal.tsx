import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { Finding, Severity, WorkspaceGraph } from "@whoami/types";
import {
  FileCodeIcon,
  FolderIcon,
  SearchIcon,
  ShieldAlertIcon,
  XIcon,
} from "./Icons.js";

export type SearchCategory = "all" | "folders" | "files" | "issues";

export interface QuickSearchModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly findings: readonly Finding[];
  readonly workspaceGraph?: WorkspaceGraph;
  readonly currentFolderPath?: string;
  readonly onSelectFinding: (finding: Finding) => void;
  readonly onSelectFile?: (filePath: string, line?: number) => void;
  readonly onSelectFolder?: (folderPath: string) => void;
}

interface IssueSearchItem {
  readonly type: "issue";
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly severity: Severity;
  readonly finding: Finding;
}

interface FileSearchItem {
  readonly type: "file";
  readonly id: string;
  readonly fileName: string;
  readonly filePath: string;
  readonly dirName: string;
  readonly issueCount: number;
  readonly highestSeverity?: Severity;
}

interface FolderSearchItem {
  readonly type: "folder";
  readonly id: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly fileCount: number;
  readonly issueCount: number;
}

type SearchItem = IssueSearchItem | FileSearchItem | FolderSearchItem;

const SEVERITY_BADGES: Record<Severity, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-severity-critical-bg", text: "text-severity-critical", border: "border-severity-critical/40" },
  high: { bg: "bg-[#332200]", text: "text-severity-high", border: "border-severity-high/40" },
  medium: { bg: "bg-[#0E2A3B]", text: "text-severity-medium", border: "border-severity-medium/40" },
  low: { bg: "bg-[#142B1A]", text: "text-severity-low", border: "border-severity-low/40" },
};

function getBasename(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function getDirname(filePath: string): string {
  const norm = filePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(0, idx) : ".";
}

/**
 * Universal Command Palette and Quick-Search Dialog for searching:
 * 1. 📁 Folders across the repository
 * 2. 📄 Files with finding counts
 * 3. 🚨 Security Issues, CWEs, and vulnerability findings
 */
export function QuickSearchModal({
  isOpen,
  onClose,
  findings,
  workspaceGraph,
  currentFolderPath = "",
  onSelectFinding,
  onSelectFile,
  onSelectFolder,
}: QuickSearchModalProps): React.ReactElement | null {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Autofocus input on open and reset query
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setActiveCategory("all");
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Index 1: Issues
  const issueItems: IssueSearchItem[] = useMemo(() => {
    return findings.map((finding) => {
      const steps = finding.trace.steps || [];
      const primaryStep = steps[steps.length - 1] || steps[0];
      const location = primaryStep
        ? `${getBasename(primaryStep.filePath)}:${primaryStep.line}`
        : "file:1";

      const subtitle = [finding.ruleId, finding.cwe, location]
        .filter(Boolean)
        .join(" • ");

      return {
        type: "issue",
        id: `issue:${finding.id}`,
        title: finding.title || finding.ruleId,
        subtitle,
        severity: finding.severity || "medium",
        finding,
      };
    });
  }, [findings]);

  // Index 2: Files (from workspaceGraph and findings)
  const fileItems: FileSearchItem[] = useMemo(() => {
    const fileMap = new Map<string, { count: number; highestSeverity?: Severity }>();

    // Index files from findings
    for (const finding of findings) {
      const primaryStep =
        finding.trace.steps[finding.trace.steps.length - 1] ||
        finding.trace.steps[0];
      if (primaryStep?.filePath && !primaryStep.filePath.startsWith("http")) {
        const pathNorm = primaryStep.filePath.replace(/\\/g, "/");
        const existing = fileMap.get(pathNorm) || { count: 0 };
        fileMap.set(pathNorm, {
          count: existing.count + 1,
          highestSeverity: existing.highestSeverity || finding.severity,
        });
      }
    }

    // Index files from workspaceGraph
    if (workspaceGraph) {
      for (const node of workspaceGraph.nodes) {
        if (node.type === "file" && node.filePath) {
          const pathNorm = node.filePath.replace(/\\/g, "/");
          if (!fileMap.has(pathNorm)) {
            fileMap.set(pathNorm, {
              count: node.findingCount || 0,
              highestSeverity: node.highestSeverity,
            });
          }
        }
      }
    }

    return Array.from(fileMap.entries()).map(([filePath, meta]) => ({
      type: "file",
      id: `file:${filePath}`,
      fileName: getBasename(filePath),
      filePath,
      dirName: getDirname(filePath),
      issueCount: meta.count,
      highestSeverity: meta.highestSeverity,
    }));
  }, [findings, workspaceGraph]);

  // Index 3: Folders (from workspaceGraph and parent paths of files)
  const folderItems: FolderSearchItem[] = useMemo(() => {
    const folderMap = new Map<string, { fileCount: number; issueCount: number }>();

    for (const file of fileItems) {
      let dir = file.dirName;
      while (dir && dir !== "." && dir !== "/") {
        const existing = folderMap.get(dir) || { fileCount: 0, issueCount: 0 };
        folderMap.set(dir, {
          fileCount: existing.fileCount + 1,
          issueCount: existing.issueCount + file.issueCount,
        });
        const parent = getDirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    }

    if (workspaceGraph) {
      for (const node of workspaceGraph.nodes) {
        if (node.type === "directory") {
          const dir = node.label.replace(/^dir:/, "");
          if (!folderMap.has(dir)) {
            folderMap.set(dir, { fileCount: 0, issueCount: 0 });
          }
        }
      }
    }

    return Array.from(folderMap.entries()).map(([folderPath, meta]) => ({
      type: "folder",
      id: `folder:${folderPath}`,
      folderName: getBasename(folderPath),
      folderPath,
      fileCount: meta.fileCount,
      issueCount: meta.issueCount,
    }));
  }, [fileItems, workspaceGraph]);

  // Filtered Results
  const filteredResults: SearchItem[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let matchedFolders = folderItems;
    let matchedFiles = fileItems;
    let matchedIssues = issueItems;

    if (q) {
      matchedFolders = folderItems.filter(
        (f) =>
          f.folderName.toLowerCase().includes(q) ||
          f.folderPath.toLowerCase().includes(q),
      );

      matchedFiles = fileItems.filter(
        (f) =>
          f.fileName.toLowerCase().includes(q) ||
          f.filePath.toLowerCase().includes(q),
      );

      matchedIssues = issueItems.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.subtitle.toLowerCase().includes(q) ||
          i.finding.description.toLowerCase().includes(q),
      );
    }

    if (activeCategory === "folders") return matchedFolders;
    if (activeCategory === "files") return matchedFiles;
    if (activeCategory === "issues") return matchedIssues;

    // "all": interleaves top matching issues, files, and folders
    return [...matchedIssues, ...matchedFiles, ...matchedFolders];
  }, [searchQuery, activeCategory, folderItems, fileItems, issueItems]);

  // Ensure selectedIndex is within range
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, activeCategory]);

  const handleSelectItem = useCallback(
    (item: SearchItem) => {
      onClose();
      if (item.type === "issue") {
        onSelectFinding(item.finding);
      } else if (item.type === "file") {
        onSelectFile?.(item.filePath, 1);
      } else if (item.type === "folder") {
        onSelectFolder?.(item.folderPath);
      }
    },
    [onClose, onSelectFinding, onSelectFile, onSelectFolder],
  );

  // Keyboard navigation inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredResults.length > 0
          ? (prev + 1) % filteredResults.length
          : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filteredResults.length > 0
          ? (prev - 1 + filteredResults.length) % filteredResults.length
          : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredResults[selectedIndex];
      if (current) {
        handleSelectItem(current);
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const categories: SearchCategory[] = ["all", "issues", "files", "folders"];
      const nextIdx = (categories.indexOf(activeCategory) + 1) % categories.length;
      setActiveCategory(categories[nextIdx]!);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-search-title"
      className="fixed inset-0 z-[99999] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-sm select-none font-sans animate-in fade-in duration-100"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col w-full max-w-2xl rounded-xl border border-vscode-border bg-vscode-bg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100">
        {/* 1. Search Bar Header */}
        <div className="flex items-center px-3.5 py-3 border-b border-vscode-border gap-2.5 bg-vscode-card">
          <SearchIcon size={16} className="text-severity-medium shrink-0" />
          <input
            ref={inputRef}
            type="text"
            id="quick-search-title"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files, folders, issues by name, path, rule or CWE… (↑↓ to navigate)"
            className="flex-1 bg-transparent text-sm text-vscode-fg placeholder-vscode-muted outline-none font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="p-1 rounded text-vscode-muted hover:text-white hover:bg-vscode-border cursor-pointer"
              title="Clear search"
            >
              <XIcon size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-vscode-muted bg-vscode-bg border border-vscode-btn-secondary rounded">
            ESC
          </kbd>
        </div>

        {/* 2. Category Tabs */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-vscode-card-hover bg-vscode-header text-xs">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`px-2 py-0.8 rounded text-xs transition cursor-pointer font-medium ${
              activeCategory === "all"
                ? "bg-vscode-primary text-white"
                : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card"
            }`}
          >
            All ({filteredResults.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("issues")}
            className={`flex items-center gap-1.5 px-2 py-0.8 rounded text-xs transition cursor-pointer font-medium ${
              activeCategory === "issues"
                ? "bg-vscode-primary text-white"
                : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card"
            }`}
          >
            <ShieldAlertIcon size={12} className="text-severity-critical" />
            <span>Issues ({issueItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("files")}
            className={`flex items-center gap-1.5 px-2 py-0.8 rounded text-xs transition cursor-pointer font-medium ${
              activeCategory === "files"
                ? "bg-vscode-primary text-white"
                : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card"
            }`}
          >
            <FileCodeIcon size={12} className="text-[#4EC9B0]" />
            <span>Files ({fileItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("folders")}
            className={`flex items-center gap-1.5 px-2 py-0.8 rounded text-xs transition cursor-pointer font-medium ${
              activeCategory === "folders"
                ? "bg-vscode-primary text-white"
                : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card"
            }`}
          >
            <FolderIcon size={12} className="text-severity-high" />
            <span>Folders ({folderItems.length})</span>
          </button>
        </div>

        {/* 3. Search Results List */}
        <div
          ref={listRef}
          className="flex flex-col max-h-[380px] overflow-y-auto p-1.5 divide-y divide-[#262626]"
        >
          {filteredResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-vscode-muted gap-2">
              <SearchIcon size={24} className="text-vscode-dim" />
              <div className="font-medium text-vscode-fg">
                No matching results found for "{searchQuery}"
              </div>
              <div className="text-[11px] text-vscode-muted">
                Try searching for a file name (.ts, .py), folder path, or CVE / vulnerability rule.
              </div>
            </div>
          ) : (
            filteredResults.map((item, index) => {
              const isSelected = index === selectedIndex;

              if (item.type === "issue") {
                const badge = SEVERITY_BADGES[item.severity];
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-vscode-card-selected/70 border border-vscode-focus/60 text-vscode-fg font-semibold"
                        : "hover:bg-vscode-card text-vscode-fg"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      <ShieldAlertIcon
                        size={15}
                        className={
                          item.severity === "critical"
                            ? "text-severity-critical"
                            : item.severity === "high"
                              ? "text-severity-high"
                              : "text-severity-medium"
                        }
                      />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">
                          {item.title}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {item.severity}
                        </span>
                      </div>
                      <span className="text-[11px] text-vscode-muted truncate font-mono mt-0.5">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>
                );
              }

              if (item.type === "file") {
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-vscode-card-selected/70 border border-vscode-focus/60 text-vscode-fg font-semibold"
                        : "hover:bg-vscode-card text-vscode-fg"
                    }`}
                  >
                    <FileCodeIcon size={15} className="text-[#4EC9B0] shrink-0" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate font-mono">
                          {item.fileName}
                        </span>
                        {item.issueCount > 0 && (
                          <span className="rounded bg-severity-critical-bg border border-severity-critical/40 px-1.5 py-0.2 text-[9px] font-mono text-severity-critical font-bold">
                            {item.issueCount} {item.issueCount === 1 ? "issue" : "issues"}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-vscode-muted truncate font-mono">
                        {item.filePath}
                      </span>
                    </div>
                  </div>
                );
              }

              // Folder item
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectItem(item)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-vscode-card-selected/70 border border-vscode-focus/60 text-vscode-fg font-semibold"
                      : "hover:bg-vscode-card text-vscode-fg"
                  }`}
                >
                  <FolderIcon size={15} className="text-severity-high shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate font-mono">
                        {item.folderName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.fileCount > 0 && (
                          <span className="text-[10px] text-vscode-muted">
                            {item.fileCount} files
                          </span>
                        )}
                        {item.issueCount > 0 && (
                          <span className="rounded bg-severity-critical-bg border border-severity-critical/40 px-1 py-0.1 text-[9px] font-mono text-severity-critical font-bold">
                            {item.issueCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-vscode-muted truncate font-mono">
                      {item.folderPath}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 4. Footer with Keyboard Shortcuts Hints */}
        <div className="flex items-center justify-between px-3.5 py-2 border-t border-vscode-card-hover bg-vscode-header text-[11px] text-vscode-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-vscode-card border border-vscode-border text-[10px] font-mono mr-1">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-vscode-card border border-vscode-border text-[10px] font-mono mr-1">
                ↵
              </kbd>
              Select
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-vscode-card border border-vscode-border text-[10px] font-mono mr-1">
                Tab
              </kbd>
              Category
            </span>
          </div>
          <span className="text-[10px] text-vscode-muted">
            {currentFolderPath ? `Workspace: ${getBasename(currentFolderPath)}` : "WhoAmI Universal Search"}
          </span>
        </div>
      </div>
    </div>
  );
}
