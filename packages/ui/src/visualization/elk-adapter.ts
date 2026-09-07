import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphEdge, GraphNode } from "@whoami/types";
import {
  ELK_GROUP_LAYOUT_OPTIONS,
  ELK_LAYOUT_OPTIONS,
  NODE_HEIGHT,
  NODE_WIDTH,
  ROLE_DIMENSIONS,
} from "./elk-layout-config.js";

// elkjs's bundled build runs its layout algorithm synchronously in-process
// (no Web Worker), which is what lets this same adapter run identically in
// the browser, in the VS Code webview, and under Vitest/jsdom.
const elk = new ELK();

export interface PositionedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly parentId?: string;
}

export interface PositionedGraph {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly GraphEdge[];
}

function getNodeDimensions(node: GraphNode): { width: number; height: number } {
  if (node.width && node.height) {
    return { width: node.width, height: node.height };
  }
  const preset = ROLE_DIMENSIONS[node.role];
  if (preset) {
    return preset;
  }
  return { width: NODE_WIDTH, height: NODE_HEIGHT };
}

/**
 * Pure function: GraphNode[]/GraphEdge[] in, computed {x,y} positions out.
 * Supports both flat DAGs and compound subflows (nodes with parentId).
 * Child positions are output relative to their parent container, matching xyflow coordinates.
 */
export async function layoutGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  direction: "DOWN" | "RIGHT" = "DOWN",
): Promise<PositionedGraph> {
  if (nodes.length === 0) {
    return { nodes: [], edges };
  }

  // Detect whether we have compound parent-child relationships
  const parentIds = new Set<string>();
  for (const node of nodes) {
    if (node.role === "group" || node.role === "boundary") {
      parentIds.add(node.id);
    }
    if (node.parentId) {
      parentIds.add(node.parentId);
    }
  }

  const childrenByParent = new Map<string, GraphNode[]>();
  const rootNodes: GraphNode[] = [];

  for (const node of nodes) {
    if (node.parentId && parentIds.has(node.parentId)) {
      const group = childrenByParent.get(node.parentId) ?? [];
      group.push(node);
      childrenByParent.set(node.parentId, group);
    } else {
      rootNodes.push(node);
    }
  }

  const hasCompoundGroups = childrenByParent.size > 0;

  let elkChildren: any[];

  if (hasCompoundGroups) {
    elkChildren = rootNodes.map((node) => {
      const dims = getNodeDimensions(node);
      const children = childrenByParent.get(node.id);

      if (children && children.length > 0) {
        return {
          id: node.id,
          layoutOptions: {
            ...ELK_GROUP_LAYOUT_OPTIONS,
            "elk.direction": direction,
          },
          children: children.map((child) => {
            const childDims = getNodeDimensions(child);
            return {
              id: child.id,
              width: childDims.width,
              height: childDims.height,
            };
          }),
        };
      }

      return {
        id: node.id,
        width: dims.width,
        height: dims.height,
      };
    });
  } else {
    elkChildren = nodes.map((node) => {
      const dims = getNodeDimensions(node);
      return {
        id: node.id,
        width: dims.width,
        height: dims.height,
      };
    });
  }

  const elkGraph = {
    id: "root",
    layoutOptions: {
      ...ELK_LAYOUT_OPTIONS,
      "elk.direction": direction,
    },
    children: elkChildren,
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const result = await elk.layout(elkGraph);

  const positioned: PositionedNode[] = [];

  function collectPositioned(children: any[], parentId?: string) {
    for (const child of children) {
      positioned.push({
        id: child.id,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? NODE_WIDTH,
        height: child.height ?? NODE_HEIGHT,
        parentId,
      });

      if (child.children && child.children.length > 0) {
        collectPositioned(child.children, child.id);
      }
    }
  }

  collectPositioned(result.children ?? []);

  return { nodes: positioned, edges };
}
