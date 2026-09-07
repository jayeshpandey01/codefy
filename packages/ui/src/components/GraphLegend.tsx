import React from "react";

export function GraphLegend(): React.ReactElement {
  return (
    <div
      role="complementary"
      aria-label="Graph Legend"
      className="absolute bottom-3 right-3 z-10 rounded-lg border border-[#303031] bg-[#252526]/95 p-2.5 text-xs text-[#D4D4D4] shadow-lg backdrop-blur-md select-none font-sans transition-all duration-150"
    >
      <div className="text-[9px] font-bold uppercase tracking-wider text-[#858585] mb-1.5 border-b border-[#303031] pb-1 flex items-center justify-between">
        <span>Graph Legend</span>
      </div>
      <div className="flex flex-col gap-1.5 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#75BEFF]" />
          <span className="text-[#CCCCCC]">Taint Source</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#F14C4C]" />
          <span className="text-[#CCCCCC]">Vulnerable Sink</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#89D185]" />
          <span className="text-[#CCCCCC]">Sanitizer Filter</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm border border-[#555555] bg-[#181818]" />
          <span className="text-[#CCCCCC]">File Subflow Group</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-[#89D185] border-dashed" />
          <span className="text-[#89D185]">Sanitized Flow</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-[#F14C4C]" />
          <span className="text-[#F14C4C] font-semibold">Tainted Flow (Pulse)</span>
        </div>
      </div>
    </div>
  );
}
