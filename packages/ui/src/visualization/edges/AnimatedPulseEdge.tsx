import type { ReactElement } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { TaintEdgeData } from "./TaintEdge.js";

/**
 * Dedicated particle pulse edge: animates a luminous packet traversing the path from source to sink.
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

      {/* Pulsing traveling dot along the path */}
      <circle r={3.5} fill={color} filter="drop-shadow(0 0 4px #F14C4C)">
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
            className="rounded border border-[#F14C4C]/40 bg-[#252526]/90 px-1.5 py-0.5 text-[10px] font-mono text-[#F14C4C] shadow-md backdrop-blur-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
