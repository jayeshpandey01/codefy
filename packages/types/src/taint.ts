import type { GraphNodeRole } from "./graph.js";

/**
 * One hop in a taint path. Deliberately shaped close to GraphNode so
 * packages/ui's elk-adapter can map a TaintTrace to GraphNode[]/GraphEdge[]
 * with little translation.
 */
export interface TaintStep {
  readonly role: GraphNodeRole;
  readonly label: string;
  readonly filePath: string;
  readonly line: number;
}

export type SinkClass =
  | "command-injection"
  | "sql-injection"
  | "ssrf"
  | "path-traversal"
  | "code-injection"
  | "prototype-pollution"
  | "secret-exposure";

/**
 * The complete source -> ... -> sink path. A Finding always carries the full
 * trace, never just the endpoints — see the taint-engine skill's non-negotiables.
 */
export interface TaintTrace {
  readonly steps: readonly TaintStep[];
  readonly sinkClass: SinkClass;
}
