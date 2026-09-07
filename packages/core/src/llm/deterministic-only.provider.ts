import type {
  CandidatePath,
  FindingRef,
  LlmSanitizerVerdict,
  UnifiedDiff,
} from "@whoami/types";

import type { ILlmTriageProvider } from "./provider.js";

/**
 * Offline default. No LLM configured, no network call, no token cost — see
 * CLAUDE.md's "Phase 1 Scope" and the "Why LLM Triage Has Two Providers"
 * ADR. Every classification comes back unresolved, which pushes the
 * candidate path to `needs-verification` rather than fabricating a verdict;
 * patch generation is refused outright since there is no model to generate
 * one from.
 */
export class DeterministicOnlyProvider implements ILlmTriageProvider {
  async classify(_path: CandidatePath): Promise<LlmSanitizerVerdict> {
    return { kind: "unresolved" };
  }

  async generatePatch(_finding: FindingRef): Promise<UnifiedDiff> {
    throw new Error(
      "DeterministicOnlyProvider cannot generate patches — no LLM is configured. Set " +
        "OPENROUTER_API_KEY to enable OpenRouterTriageProvider instead.",
    );
  }
}
