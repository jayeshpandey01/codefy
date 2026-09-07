import type { ReactElement } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface TaintEdgeData extends Record<string, unknown> {
  readonly tainted?: boolean;
  readonly animated?: boolean;
  readonly isHighlighted?: boolean;
  readonly isDimmed?: boolean;
  readonly payloadExpression?: string;
}

const TAINTED_STROKE = "#F14C4C";
const SAFE_STROKE = "#89D185";
const DEFAULT_STROKE = "#75BEFF";

/**
 * Custom edge for the attack-path graph: styled to VS Code Dark Modern theme
 * with animated particle pulses indicating active taint flow.
 */
export function TaintEdge(props: EdgeProps): ReactElement {
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
  const tainted = edgeData?.tainted ?? true;
  const animated = edgeData?.animated ?? true;
  const isHighlighted = edgeData?.isHighlighted ?? false;
  const isDimmed = edgeData?.isDimmed ?? false;
  const payload = edgeData?.payloadExpression;

  const stroke = isHighlighted
    ? "#FFFFFF"
    : tainted
      ? TAINTED_STROKE
      : SAFE_STROKE;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke,
          strokeWidth: isHighlighted ? 3 : tainted ? 2.5 : 1.5,
          strokeDasharray: animated && tainted ? "8 6" : tainted ? undefined : "4 2",
          animation: animated && tainted ? "xyflowTaintDash 1.2s linear infinite" : undefined,
          opacity: isDimmed ? 0.25 : 1,
          transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.2s",
        }}
      />
      {(label || payload) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className={[
              "flex flex-col items-center rounded border px-1.5 py-0.5 text-[10px] font-mono shadow-md backdrop-blur-sm transition-opacity duration-150",
              isDimmed ? "opacity-30" : "opacity-100",
              tainted
                ? "bg-[#252526]/90 border-[#F14C4C]/40 text-[#F14C4C]"
                : "bg-[#252526]/90 border-[#89D185]/40 text-[#89D185]",
            ].join(" ")}
          >
            {label && <span className="font-semibold">{label}</span>}
            {payload && (
              <span className="text-[9px] text-[#A0A0A0] max-w-[120px] truncate">
                {payload}
              </span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
