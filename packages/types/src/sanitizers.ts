import type { SinkClass } from "./taint.js";

export interface SanitizerPattern {
  readonly id: string;
  readonly sinkClass: SinkClass;
  readonly description: string;
}

/** Verdict from deterministic pattern matching only — never involves an LLM call. */
export type SanitizerVerdict = "known-safe" | "no-match";
