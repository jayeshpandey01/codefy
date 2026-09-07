import type { GraphNodeRole } from "@whoami/types";

/**
 * One shared place for elkjs layout tuning -- don't scatter this across
 * components. See the react-flow-visualizer skill.
 */
export const ELK_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.spacing.nodeNode": "56",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
  "elk.layered.spacing.edgeNodeBetweenLayers": "48",
  "elk.spacing.componentComponent": "64",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
};

export const ELK_GROUP_LAYOUT_OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.padding": "[top=72,left=32,bottom=32,right=32]",
  "elk.spacing.nodeNode": "52",
  "elk.layered.spacing.nodeNodeBetweenLayers": "64",
  "elk.spacing.componentComponent": "56",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
};

/** Precise rendered size of graph nodes by role, used to size the elk graph. */
export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 68;

export const ROLE_DIMENSIONS: Record<
  GraphNodeRole,
  { width: number; height: number }
> = {
  source: { width: 240, height: 68 },
  sink: { width: 260, height: 72 },
  sanitizer: { width: 240, height: 68 },
  passthrough: { width: 240, height: 64 },
  cluster: { width: 260, height: 48 },
  annotation: { width: 260, height: 96 },
  group: { width: 340, height: 180 }, // Minimum fallback if empty
  boundary: { width: 380, height: 220 },
  asset: { width: 260, height: 72 },
  decision: { width: 240, height: 76 },
  safe_exit: { width: 220, height: 56 },
  package: { width: 240, height: 68 },
  endpoint: { width: 240, height: 64 },
  probe: { width: 240, height: 64 },
};
