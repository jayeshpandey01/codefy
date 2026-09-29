import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";

export interface GraphFocusHelperProps {
  readonly targetNodeId: string | null;
}

/**
 * Child component inside ReactFlow that smoothly glides the camera / viewport
 * to center on a target node when it is focused (e.g. from Quick Search).
 */
export function GraphFocusHelper({ targetNodeId }: GraphFocusHelperProps): null {
  const { fitView, getNode } = useReactFlow();
  const lastTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetNodeId || targetNodeId === lastTargetRef.current) return;
    if (!targetNodeId) {
      lastTargetRef.current = null;
      return;
    }
    if (targetNodeId === lastTargetRef.current) return;
    lastTargetRef.current = targetNodeId;

    const timer = setTimeout(() => {
      const node = getNode(targetNodeId);
      if (node) {
        fitView({
          nodes: [{ id: targetNodeId }],
          duration: 350,
          maxZoom: 0.8,
          padding: 0.4,
        });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [targetNodeId, fitView, getNode]);

  return null;
}
