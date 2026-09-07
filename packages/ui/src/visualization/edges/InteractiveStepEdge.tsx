import type { ReactElement } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { ShieldCheckIcon } from "../../components/Icons.js";

export interface InteractiveEdgeData extends Record<string, unknown> {
  readonly tainted?: boolean;
  readonly onInspectEdge?: (edgeId: string) => void;
  readonly isHighlighted?: boolean;
  readonly isDimmed?: boolean;
}

/**
 * Interactive edge pattern from xyflow with interactive inspect/filter button rendered on the label.
 */
export function InteractiveStepEdge(props: EdgeProps): ReactElement {
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

  const edgeData = data as InteractiveEdgeData | undefined;
  const tainted = edgeData?.tainted ?? true;
  const stroke = tainted ? "#F14C4C" : "#89D185";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke,
          strokeWidth: 2,
          strokeDasharray: tainted ? undefined : "4 2",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="flex items-center gap-1 rounded border border-[#3C3C3C] bg-[#1E1E1E] px-1.5 py-0.5 text-[10px] font-mono shadow-md hover:border-[#75BEFF] transition-all cursor-pointer select-none"
          onClick={(e) => {
            e.stopPropagation();
            edgeData?.onInspectEdge?.(id);
          }}
          title="Click to inspect hop data transformation"
        >
          {label && (
            <span className={tainted ? "text-[#F14C4C]" : "text-[#89D185]"}>
              {label}
            </span>
          )}
          <button
            type="button"
            className="p-0.5 text-[#858585] hover:text-[#75BEFF] transition-colors"
            title="Inspect Taint Hop"
          >
            <ShieldCheckIcon size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
