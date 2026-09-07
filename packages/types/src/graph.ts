import type { Severity } from "./findings.js";

export type GraphNodeRole =
  | "source"
  | "sink"
  | "sanitizer"
  | "passthrough"
  | "group"
  | "cluster"
  | "annotation"
  | "boundary"
  | "asset"
  | "decision"
  | "safe_exit"
  | "package"
  | "endpoint"
  | "probe";

export interface GraphNode {
  readonly id: string;
  readonly role: GraphNodeRole;
  readonly label: string;
  readonly filePath: string;
  readonly line: number;
  readonly parentId?: string;
  readonly extent?: "parent";
  readonly width?: number;
  readonly height?: number;
  readonly collapsed?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type GraphEdgeType =
  | "taint"
  | "pulse"
  | "step"
  | "contains"
  | "defines"
  | "calls"
  | "originates_in"
  | "sinks_at"
  | "flows_through"
  | "threat_vector"
  | "branch_true"
  | "branch_false"
  | "depends_on"
  | "hosts"
  | "exposes"
  | "probes";

export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly tainted: boolean;
  readonly type?: GraphEdgeType;
  readonly animated?: boolean;
  readonly data?: Readonly<{
    tainted?: boolean;
    label?: string;
    payloadExpression?: string;
    severity?: Severity;
    [key: string]: unknown;
  }>;
}

export type WorkspaceNodeType =
  | "directory"
  | "file"
  | "class"
  | "function"
  | "module";

export interface WorkspaceGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: WorkspaceNodeType;
  readonly filePath: string;
  readonly line?: number;
  readonly findingCount?: number;
  readonly highestSeverity?: Severity;
  readonly parentId?: string;
}

export interface WorkspaceGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly type: "contains" | "imports" | "calls" | "defines";
}

export interface WorkspaceGraph {
  readonly nodes: readonly WorkspaceGraphNode[];
  readonly edges: readonly WorkspaceGraphEdge[];
}

export type UnifiedNodeType = WorkspaceNodeType | GraphNodeRole;

export interface UnifiedGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: UnifiedNodeType;
  readonly role?: GraphNodeRole;
  readonly filePath: string;
  readonly line?: number;
  readonly parentId?: string;
  readonly findingCount?: number;
  readonly highestSeverity?: Severity;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UnifiedGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string;
  readonly type: GraphEdgeType;
  readonly tainted?: boolean;
  readonly animated?: boolean;
}

export interface UnifiedGraph {
  readonly nodes: readonly UnifiedGraphNode[];
  readonly edges: readonly UnifiedGraphEdge[];
}
