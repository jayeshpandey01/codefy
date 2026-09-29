import type { FitViewOptions } from "@xyflow/react";

/**
 * Standard minimum and maximum zoom boundaries for all graph visualizers.
 *
 * React Flow defaults to [0.5, 2.0], which severely limits architectural
 * overviews of large codebases. Expanding to [0.05, 4.0] allows:
 *  - 10x deeper zoom out (5%) to inspect large architectures and dependency trees
 *  - 2x deeper zoom in (400%) to inspect syntax tokens, parameters, and taint flows
 */
export const GRAPH_MIN_ZOOM = 0.05;
export const GRAPH_MAX_ZOOM = 4.0;

/** Default overview zoom level (30%). */
export const GRAPH_DEFAULT_ZOOM = 0.30;

/** Level-of-detail threshold: below this zoom, render lightweight low-overhead nodes & edges. */
export const LOD_COMPACT_ZOOM_THRESHOLD = 0.45;

/** Default animation duration for zoom and fitView actions (ms). */
export const GRAPH_ZOOM_TRANSITION_MS = 250;

/** Default fitView options ensuring auto-fit scales large graphs without clipping and caps at 30% overview. */
export const GRAPH_DEFAULT_FIT_VIEW_OPTIONS: FitViewOptions = {
  padding: 0.15,
  minZoom: GRAPH_MIN_ZOOM,
  maxZoom: GRAPH_DEFAULT_ZOOM,
  duration: GRAPH_ZOOM_TRANSITION_MS,
};

/** Formats a decimal zoom level (e.g. 1.0, 0.45) as a human-readable percentage ("100%", "45%"). */
export function formatZoomPercentage(zoom: number): string {
  if (!Number.isFinite(zoom) || zoom <= 0) return "100%";
  return `${Math.round(zoom * 100)}%`;
}

/** Clamps a zoom level within standard boundaries. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1.0;
  return Math.min(Math.max(zoom, GRAPH_MIN_ZOOM), GRAPH_MAX_ZOOM);
}

