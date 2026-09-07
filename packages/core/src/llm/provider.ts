import type {
  CandidatePath,
  FindingRef,
  LlmSanitizerVerdict,
  UnifiedDiff,
} from "@whoami/types";

/**
 * The only seam through which anything in this package may ask a model a
 * question. Always narrow and structured — classify exactly one candidate
 * taint path, or generate exactly one patch for exactly one finding. Never
 * an open-ended "review this code"/"find bugs" call — see
 * docs/DETECTION-ENGINE-SPEC.md §A.0 (Purba et al. 2024) for why that
 * narrowness is what makes LLM triage precision-viable at all, and the
 * taint-engine skill's non-negotiable #1: taint/propagation code never
 * imports an LLM client itself, only this interface.
 */
export interface ILlmTriageProvider {
  classify(path: CandidatePath): Promise<LlmSanitizerVerdict>;
  generatePatch(finding: FindingRef): Promise<UnifiedDiff>;
}
