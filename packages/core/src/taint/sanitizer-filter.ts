import type { CandidatePath, FindingStatus } from "@whoami/types";

import type { ILlmTriageProvider } from "../llm/provider.js";
import { matchKnownSanitizerPattern } from "./sanitizers.js";

/**
 * Real TypeScript implementation of docs/DETECTION-ENGINE-SPEC.md §A.3's
 * resolveSanitizerStatus pseudocode.
 *
 * One adaptation from the pseudocode: that pseudocode iterates
 * `guards = findGuardsOnPath(path)` (plural) and returns as soon as any
 * guard matches known-safe. The actual `CandidatePath` type in
 * @whoami/types carries a single `guardSourceSnippet: string` field, not an
 * array of guards — so src/taint/propagate.ts is responsible for finding
 * *the* nearest reachability-gating guard on a path (if any) and folding it
 * into that one field (empty string when there is none). This function
 * then treats "no guard" (empty string) as the pseudocode's `guards.length
 * === 0` case, and a non-empty snippet as the pseudocode's single-guard
 * case — never an open-ended LLM "review this code" call either way, per
 * the taint-engine skill's non-negotiables.
 */
export async function resolveSanitizerStatus(
  path: CandidatePath,
  llmProvider: ILlmTriageProvider,
): Promise<FindingStatus> {
  const guardSnippet = path.guardSourceSnippet.trim();

  if (guardSnippet.length === 0) {
    return "confirmed";
  }

  const verdict = matchKnownSanitizerPattern(guardSnippet, path.sinkClass);
  if (verdict === "known-safe") {
    return "discarded";
  }

  // Unresolvable by deterministic pattern rules alone -> route to the
  // injected ILlmTriageProvider. Under DeterministicOnlyProvider (the
  // offline default) this always comes back 'unresolved'; under
  // OpenRouterTriageProvider (opt-in) it may actually resolve.
  const llmVerdict = await llmProvider.classify(path);
  if (llmVerdict.kind === "unresolved") {
    return "needs-verification";
  }
  return llmVerdict.safe ? "discarded" : "confirmed";
}
