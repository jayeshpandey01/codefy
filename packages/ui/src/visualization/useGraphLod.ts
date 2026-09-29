import { useStore, type ReactFlowState } from "@xyflow/react";
import { LOD_COMPACT_ZOOM_THRESHOLD } from "./zoom-config.js";

/**
 * High-performance Level of Detail (LOD) hook.
 *
 * Subscribes to React Flow's zoom transform using a boolean selector.
 * Because Zustand evaluates boolean equality (false === false, true === true),
 * this hook ONLY triggers a single component re-render when zoom crosses the
 * threshold (0.45). It NEVER re-renders during smooth zooming or panning
 * within the same LOD tier.
 *
 * Returns:
 *  - isLowLod: true when zoom < 0.45 (switch to lightweight chips & static edges)
 */
export function useGraphLod(): { isLowLod: boolean } {
  const isLowLod = useStore(
    (state: ReactFlowState) =>
      Boolean(state.transform && state.transform[2] < LOD_COMPACT_ZOOM_THRESHOLD),
  );

  return { isLowLod };
}
