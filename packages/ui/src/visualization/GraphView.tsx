import { lazy, Suspense, useState, type ReactElement } from "react";
import type { Finding, GraphNode, TaintTrace } from "@whoami/types";
import { GraphContainer } from "./GraphContainer.js";

// Lazy: cytoscape adds ~750KB gzipped on its own. React Flow is the default
// engine, so that weight should only load if someone actually picks
// Cytoscape from the dropdown below, not on every app that renders GraphView.
const CytoscapeGraphView = lazy(() =>
  import("./CytoscapeGraphView.js").then((mod) => ({
    default: mod.CytoscapeGraphView,
  })),
);

export type GraphEngine = "reactflow" | "cytoscape";

const ENGINE_LABEL: Record<GraphEngine, string> = {
  reactflow: "React Flow (interconnected elkjs)",
  cytoscape: "Cytoscape (breadthfirst layout)",
};

export interface GraphViewProps {
  readonly trace?: TaintTrace;
  readonly findings?: readonly Finding[];
  readonly onNodeClick?: (node: GraphNode) => void;
  readonly defaultEngine?: GraphEngine;
  readonly direction?: "DOWN" | "RIGHT";
  readonly groupByFile?: boolean;
}

/**
 * Engine-switchable attack-path graph: supports single trace or multi-finding interconnected graphs.
 */
export function GraphView({
  trace,
  findings,
  onNodeClick,
  defaultEngine = "reactflow",
  direction = "DOWN",
  groupByFile = true,
}: GraphViewProps): ReactElement {
  const [engine, setEngine] = useState<GraphEngine>(defaultEngine);

  return (
    <div className="flex h-full w-full flex-col bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Attack path
        </span>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <span className="sr-only">Visualization engine</span>
          <select
            value={engine}
            onChange={(event) => setEngine(event.target.value as GraphEngine)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-teal-400 focus:outline-none"
          >
            {(Object.keys(ENGINE_LABEL) as GraphEngine[]).map((value) => (
              <option key={value} value={value}>
                {ENGINE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 bg-slate-950">
        {engine === "reactflow" ? (
          <GraphContainer
            trace={trace}
            findings={findings}
            onNodeClick={onNodeClick}
            direction={direction}
            groupByFile={groupByFile}
          />
        ) : (
          <Suspense
            fallback={
              <div className="p-4 text-sm text-slate-500">
                Loading Cytoscape…
              </div>
            }
          >
            <CytoscapeGraphView trace={trace} onNodeClick={onNodeClick} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
