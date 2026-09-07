import React from "react";
import {
  AllIssuesIcon,
  LogoIcon,
  RemoteScanIcon,
  TreeViewIcon,
} from "./Icons.js";

export type ActivityMode = "workspace" | "tree" | "remote";

export interface ActivityBarProps {
  activeMode: ActivityMode;
  onSelectMode: (mode: ActivityMode) => void;
  findingCount?: number;
}

export function ActivityBar({
  activeMode,
  onSelectMode,
  findingCount = 0,
}: ActivityBarProps): React.ReactElement {
  return (
    <aside
      aria-label="Activity Bar"
      className="flex w-12 flex-col items-center justify-start border-r border-[#303031] bg-[#181818] py-2 select-none shrink-0 font-sans"
    >
      {/* Top Brand Logo */}
      <div className="flex flex-col items-center gap-2.5 w-full">
        <button
          type="button"
          onClick={() => onSelectMode("workspace")}
          title="WhoAmI Security Platform"
          className="flex h-9 w-9 items-center justify-center rounded-md text-[#858585] hover:text-white hover:bg-[#2A2D2E] active:bg-[#323233] transition-all duration-150 cursor-pointer mb-0.5"
        >
          <LogoIcon size={19} />
        </button>

        {/* Workspace Findings & Taint Graph */}
        <button
          type="button"
          onClick={() => onSelectMode("workspace")}
          title="Issues & Data Flow Analysis"
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-all duration-150 cursor-pointer ${
            activeMode === "workspace"
              ? "bg-[#2A2D2E] text-white shadow-sm ring-1 ring-white/10"
              : "text-[#858585] hover:text-white hover:bg-[#2A2D2E] active:bg-[#323233]"
          }`}
        >
          <AllIssuesIcon size={19} />
          {findingCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#007ACC] px-1 text-[8px] font-bold text-white shadow-sm">
              {findingCount > 99 ? "99+" : findingCount}
            </span>
          )}
        </button>

        {/* Workspace Code Tree View */}
        <button
          type="button"
          onClick={() => onSelectMode("tree")}
          title="Workspace Architecture & Dependency Tree"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-all duration-150 cursor-pointer ${
            activeMode === "tree"
              ? "bg-[#2A2D2E] text-white shadow-sm ring-1 ring-white/10"
              : "text-[#858585] hover:text-white hover:bg-[#2A2D2E] active:bg-[#323233]"
          }`}
        >
          <TreeViewIcon size={19} />
        </button>

        {/* Remote Cloud Scanner */}
        <button
          type="button"
          onClick={() => onSelectMode("remote")}
          title="Authorized Remote Scanner (Nuclei, HTTPX, Nmap)"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-all duration-150 cursor-pointer ${
            activeMode === "remote"
              ? "bg-[#2A2D2E] text-white shadow-sm ring-1 ring-white/10"
              : "text-[#858585] hover:text-white hover:bg-[#2A2D2E] active:bg-[#323233]"
          }`}
        >
          <RemoteScanIcon size={19} />
        </button>
      </div>
    </aside>
  );
}
