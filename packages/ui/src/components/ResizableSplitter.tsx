import React, { useState, useEffect, useCallback } from "react";
import { GripVerticalIcon } from "./Icons.js";

export interface ResizableSplitterProps {
  /** Called with the pixel delta when dragging */
  readonly onResize: (delta: number) => void;
  /** Optional callback on double-click to reset width */
  readonly onReset?: () => void;
  /** Custom extra classes */
  readonly className?: string;
  /** Accessible tooltip / label */
  readonly title?: string;
}

export function ResizableSplitter({
  onResize,
  onReset,
  className = "",
  title = "Drag to resize (double click to reset)",
}: ResizableSplitterProps): React.ReactElement {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      let lastX = e.clientX;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - lastX;
        lastX = moveEvent.clientX;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onResize],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      title={title}
      onMouseDown={handleMouseDown}
      onDoubleClick={onReset}
      className={`relative flex w-1.5 shrink-0 items-center justify-center cursor-col-resize select-none transition-colors duration-150 ${
        isDragging
          ? "bg-vscode-primary/70"
          : "hover:bg-vscode-focus/30 active:bg-vscode-primary/70"
      } ${className}`}
    >
      {/* Centered 3-dot splitter grip handle matching Image 1 */}
      <div
        className={`flex items-center justify-center text-vscode-dim transition-colors ${
          isDragging
            ? "text-white"
            : "hover:text-vscode-fg group-hover:text-vscode-fg"
        }`}
      >
        <GripVerticalIcon size={14} className="opacity-80 hover:opacity-100" />
      </div>
    </div>
  );
}
