import type { SinkClass, TaintStep } from "./taint.js";

/**
 * Everything ILlmTriageProvider needs to classify one candidate path — never
 * the source file, never an open-ended "review this code" payload. See
 * docs/DETECTION-ENGINE-SPEC.md §A.0 for why this stays this narrow.
 */
export interface CandidatePath {
  readonly id: string;
  readonly sinkClass: SinkClass;
  readonly steps: readonly TaintStep[];
  readonly guardSourceSnippet: string;
}

export type LlmSanitizerVerdict =
  | { readonly kind: "unresolved" }
  | {
      readonly kind: "resolved";
      readonly safe: boolean;
      readonly reason: string;
    };

export interface UnifiedDiff {
  readonly filePath: string;
  readonly diff: string;
}

export interface FindingRef {
  readonly id: string;
  readonly filePath: string;
}
