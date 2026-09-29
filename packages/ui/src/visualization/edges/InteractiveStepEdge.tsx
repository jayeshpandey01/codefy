import type { ReactElement } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { ShieldCheckIcon } from "../../components/Icons.js";
import { useGraphLod } from "../useGraphLod.js";

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
  const { isLowLod } = useGraphLod();
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

  if (isLowLod) {
    return (
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke,
          strokeWidth: 1.5,
          strokeDasharray: tainted ? undefined : "4 2",
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
          className="flex items-center gap-1 rounded border border-vscode-border bg-vscode-bg px-1.5 py-0.5 text-[10px] font-mono shadow-md hover:border-severity-medium transition-all cursor-pointer select-none"
          onClick={(e) => {
            e.stopPropagation();
            edgeData?.onInspectEdge?.(id);
          }}
          title="Click to inspect hop data transformation"
        >
          {label && (
            <span className={tainted ? "text-severity-critical" : "text-severity-low"}>
              {label}
            </span>
          )}
          <button
            type="button"
            className="p-0.5 text-vscode-muted hover:text-severity-medium transition-colors"
            title="Inspect Taint Hop"
          >
            <ShieldCheckIcon size={10} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
