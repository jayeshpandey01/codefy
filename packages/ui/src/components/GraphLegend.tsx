import React from "react";

export function GraphLegend(): React.ReactElement {
  return (
    <div
      role="complementary"
      aria-label="Graph Legend"
      className="absolute bottom-3 right-3 z-10 rounded-lg border border-vscode-border bg-vscode-card p-2.5 text-xs text-vscode-fg shadow-lg select-none font-sans transition-all duration-150"
    >
      <div className="text-[9px] font-bold uppercase tracking-wider text-vscode-muted mb-1.5 border-b border-vscode-border pb-1 flex items-center justify-between">
        <span>Graph Legend</span>
      </div>
      <div className="flex flex-col gap-1.5 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-severity-medium" />
          <span className="text-vscode-fg">Taint Source</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-severity-critical" />
          <span className="text-vscode-fg">Vulnerable Sink</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-severity-low" />
          <span className="text-vscode-fg">Sanitizer Filter</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm border border-vscode-dim bg-vscode-header" />
          <span className="text-vscode-fg">File Subflow Group</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-severity-low border-dashed" />
          <span className="text-severity-low">Sanitized Flow</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-severity-critical" />
          <span className="text-severity-critical font-semibold">Tainted Flow (Pulse)</span>
        </div>
      </div>
    </div>
  );
}
