import type { ReactElement } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { TaintEdgeData } from "./TaintEdge.js";
import { useGraphLod } from "../useGraphLod.js";

/**
 * Dedicated particle pulse edge: animates a luminous packet traversing the path from source to sink.
 * Automatically switches to lightweight static vector rendering at low zoom levels to preserve 60fps.
 */
export function AnimatedPulseEdge(props: EdgeProps): ReactElement {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    label,
    data,
    markerEnd,
    style,
  } = props;
  const { isLowLod } = useGraphLod();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeData = data as TaintEdgeData | undefined;
  const isHighlighted = edgeData?.isHighlighted ?? false;
  const isDimmed = edgeData?.isDimmed ?? false;
  const tainted = edgeData?.tainted ?? true;

  const color = tainted ? "#F14C4C" : "#89D185";

  // Low LOD: pure static vector edge with zero DOM labels and zero animated particles
  if (isLowLod) {
    return (
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isHighlighted ? "#FFFFFF" : color,
          strokeWidth: isHighlighted ? 2.5 : 1.5,
          opacity: isDimmed ? 0.25 : 0.85,
        }}
      />
    );
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isHighlighted ? "#FFFFFF" : color,
          strokeWidth: isHighlighted ? 3 : 2,
          opacity: isDimmed ? 0.25 : 0.85,
        }}
      />

      {/* Pulsing traveling dot along the path (GPU accelerated without drop-shadow filter) */}
      <circle r={3} fill={color}>
        <animateMotion
          path={edgePath}
          dur="1.6s"
          repeatCount="indefinite"
        />
      </circle>

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="rounded border border-severity-critical/40 bg-vscode-card/95 px-1.5 py-0.5 text-[10px] font-mono text-severity-critical shadow-md"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
