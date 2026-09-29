import { useCallback, type ReactElement } from "react";
import {
  Panel,
  useReactFlow,
  useViewport,
  type PanelPosition,
} from "@xyflow/react";
import {
  GRAPH_DEFAULT_FIT_VIEW_OPTIONS,
  GRAPH_DEFAULT_ZOOM,
  GRAPH_ZOOM_TRANSITION_MS,
  formatZoomPercentage,
} from "./zoom-config.js";

export interface GraphZoomControlsProps {
  readonly position?: PanelPosition;
  readonly className?: string;
  readonly showPercentage?: boolean;
  readonly showFitView?: boolean;
}

/**
 * Enhanced zoom controls toolbar for React Flow graphs.
 *
 * Provides:
 *  - Zoom in (+) button
 *  - Zoom out (-) button
 *  - Real-time zoom level badge (e.g. "100%", "45%"), clickable to reset to 100%
 *  - Real-time zoom level badge (e.g. "30%", "100%"), clickable to reset to default 30%
 *  - Fit-to-screen (⛶) button
 *  - Smooth easing animations
 *  - Fully styled to match VS Code dark theme
 */
export function GraphZoomControls({
  position = "bottom-left",
  className = "",
  showPercentage = true,
  showFitView = true,
}: GraphZoomControlsProps): ReactElement {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
  const { zoom } = useViewport();

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: GRAPH_ZOOM_TRANSITION_MS });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: GRAPH_ZOOM_TRANSITION_MS });
  }, [zoomOut]);

  const handleResetZoom = useCallback(() => {
    zoomTo(1.0, { duration: GRAPH_ZOOM_TRANSITION_MS });
    zoomTo(GRAPH_DEFAULT_ZOOM, { duration: GRAPH_ZOOM_TRANSITION_MS });
  }, [zoomTo]);

  const handleFitView = useCallback(() => {
    fitView(GRAPH_DEFAULT_FIT_VIEW_OPTIONS);
  }, [fitView]);

  return (
    <Panel
      position={position}
      className={`flex items-center gap-0.5 rounded border border-vscode-border bg-vscode-card p-0.5 shadow-md select-none font-sans text-xs ${className}`}
    >
      {/* Zoom Out Button */}
      <button
        type="button"
        onClick={handleZoomOut}
        title="Zoom Out (Scroll down or pinch)"
        aria-label="Zoom Out"
        className="flex h-6 w-6 items-center justify-center rounded text-vscode-fg hover:bg-vscode-border hover:text-white active:bg-vscode-border transition-colors cursor-pointer"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Live Zoom Level Indicator & 1-Click 30% Reset */}
      {showPercentage && (
        <button
          type="button"
          onClick={handleResetZoom}
          title="Current Zoom Level — Click to reset to default (30%)"
          aria-label="Reset zoom to default (30%)"
          className="px-1.5 py-0.5 min-w-[42px] text-center font-mono text-[11px] font-medium text-vscode-fg hover:bg-vscode-border hover:text-severity-medium rounded transition-colors cursor-pointer"
        >
          {formatZoomPercentage(zoom)}
        </button>
      )}

      {/* Zoom In Button */}
      <button
        type="button"
        onClick={handleZoomIn}
        title="Zoom In (Scroll up or spread)"
        aria-label="Zoom In"
        className="flex h-6 w-6 items-center justify-center rounded text-vscode-fg hover:bg-vscode-border hover:text-white active:bg-vscode-border transition-colors cursor-pointer"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Divider */}
      {showFitView && <div className="h-3.5 w-px bg-vscode-border mx-0.5" />}

      {/* Fit to View Button */}
      {showFitView && (
        <button
          type="button"
          onClick={handleFitView}
          title="Fit graph to viewport"
          aria-label="Fit graph to viewport"
          className="flex h-6 w-6 items-center justify-center rounded text-vscode-fg hover:bg-vscode-border hover:text-[#4EC9B0] active:bg-vscode-border transition-colors cursor-pointer"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      )}
    </Panel>
  );
}

