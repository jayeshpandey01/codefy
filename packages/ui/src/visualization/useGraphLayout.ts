import { useEffect, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@whoami/types";
import { layoutGraph, type PositionedGraph } from "./elk-adapter.js";

export interface GraphLayoutState {
  readonly graph: PositionedGraph | undefined;
  readonly isLayouting: boolean;
  readonly error: Error | undefined;
}

/**
 * Runs elkjs layout off the render path: computed once per (nodes, edges, direction)
 * identity change, memoized, never re-run on pan/zoom/selection.
 */
export function useGraphLayout(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  direction: "DOWN" | "RIGHT" = "DOWN",
): GraphLayoutState {
  const [graph, setGraph] = useState<PositionedGraph>();
  const [isLayouting, setIsLayouting] = useState(false);
  const [error, setError] = useState<Error>();
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setIsLayouting(true);
    setError(undefined);

    layoutGraph(nodes, edges, direction)
      .then((result) => {
        if (requestIdRef.current !== requestId) return; // stale -- a newer request has since started
        setGraph(result);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setIsLayouting(false);
      });
  }, [nodes, edges, direction]);

  return { graph, isLayouting, error };
}
