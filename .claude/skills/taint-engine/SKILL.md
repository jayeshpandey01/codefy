---
name: taint-engine
description: Use when implementing or modifying the deterministic taint analysis pipeline in packages/core — defining sources/sinks/sanitizers, tracing data-flow paths, working with ILlmTriageProvider, or emitting Finding/TaintTrace objects.
---

# Taint Engine (packages/core)

The core detection pipeline. This is the deterministic half of the "Deterministic Taint + LLM Triage" principle from CLAUDE.md — read that section, and **Phase 1 Scope**, first if you haven't. Detection itself is always deterministic (AST parsing, pattern rules) and runs offline by default; LLM triage is opt-in on top of that, never load-bearing.

**For actual rule content — sources/sinks/sanitizers per language, the 3 initial ast-grep rules, the sanitizer-filter algorithm, PoC probe definitions — see [`docs/DETECTION-ENGINE-SPEC.md`](../../../docs/DETECTION-ENGINE-SPEC.md).** This skill describes the pipeline shape and non-negotiables; that doc holds the concrete rule content to implement against.

## Pipeline shape

```
Source AST/query match (tree-sitter, see [[tree-sitter-parser]])
  → data-flow propagation (deterministic graph walk)
  → sink match found?
      → intermediary sanitizer present on path?
          → known safe sanitizer pattern    → discard path, no Finding
          → unresolvable by pattern rules    → ILlmTriageProvider.classify()
                                                 → DeterministicOnlyProvider (no LLM configured): always "unresolved" → needs-verification
                                                 → OpenRouterTriageProvider (testing, OPENROUTER_API_KEY set): real classification
          → no sanitizer                    → emit Finding (confirmed)
  → emit TaintTrace + Finding (typed per @whoami/types)
```

## Non-negotiables (from CLAUDE.md's Zero-Bloat Contract)

1. **Source/sink/sanitizer matching and path propagation never call an LLM directly.** The "is this specific intermediary function a sanitizer" judgment always routes through `ILlmTriageProvider` — taint code never imports an LLM client itself. Which implementation is bound (`DeterministicOnlyProvider` by default, `OpenRouterTriageProvider` when `OPENROUTER_API_KEY` is set) is an engine-construction concern, not something taint/propagation code branches on.
2. **No invented confidence scores.** A path resolves to one of three states, never a numeric score: `confirmed | needs-verification | discarded`. If you're tempted to add a 0–100 "confidence" number, stop — that's exactly the noise CLAUDE.md says to avoid.
3. **Every Finding must carry its full TaintTrace** — the complete source→...→sink node path — not just the endpoints. The UI's attack-path visualization ([[react-flow-visualizer]]) renders this trace directly; don't summarize it away in the engine.
4. **The `ILlmTriageProvider` interface stays narrow and structured** regardless of which implementation is bound — its shape (e.g. `classify(candidatePath): SanitizerVerdict`, `generatePatch(finding): UnifiedDiff`) takes one candidate path and returns one structured verdict, never an open-ended "ask the LLM anything" chat interface. `OpenRouterTriageProvider` must build a prompt from exactly this narrow shape, not a free-form "review this code" prompt — see `docs/DETECTION-ENGINE-SPEC.md` §A.0 for why that narrowness is what makes LLM triage precision-viable at all.

## Where this lives

- `packages/core/src/taint/sources.ts`, `sinks.ts`, `sanitizers.ts` — pattern registries, per language.
- `packages/core/src/taint/propagate.ts` — the deterministic graph walk.
- `packages/core/src/llm/provider.ts` — `ILlmTriageProvider` interface.
- `packages/core/src/llm/deterministic-only.provider.ts` — offline default, always returns "unresolved."
- `packages/core/src/llm/openrouter.provider.ts` — testing-phase real implementation, opt-in via `OPENROUTER_API_KEY`.
- `packages/core/src/secrets/` — in-process regex + Shannon-entropy secret detector (not TruffleHog — see CLAUDE.md ADR).
- `packages/core/src/__tests__/fixtures/` — vulnerable/safe code pairs used as golden tests.

## Fixture-driven testing pattern

Every source/sink/sanitizer rule should ship with at least two fixtures: one that should produce a Finding, one structurally similar that shouldn't (because a real sanitizer sits on the path). This is how you catch both false negatives and false positives — the two failure modes CLAUDE.md explicitly calls out.

```
pnpm --filter @whoami/core test -- --testNamePattern="sql-injection" --watch
```

## Adding a new vulnerability class

1. Add source/sink patterns to the relevant registry file (reuse tree-sitter queries from [[tree-sitter-parser]]).
2. Add known-safe sanitizer patterns for that sink class.
3. Add fixtures (vulnerable + safe) and a test.
4. If a case is genuinely ambiguous and no pattern rule resolves it, route it through `ILlmTriageProvider` (which resolves it if a real provider is configured, or lands it on `needs-verification` under the offline default) — do not add a special-case deterministic guess just to force a `confirmed`/`discarded` result.
5. Confirm the emitted Finding/TaintTrace matches the shape in `packages/types` — if it doesn't, fix the type first (contract-first, per CLAUDE.md), not the emitter.

## Related

- [[tree-sitter-parser]] — supplies the AST/queries this pipeline walks.
- [[react-flow-visualizer]] — renders the TaintTrace this pipeline emits.
- [[webview-bridge]] — how Findings cross from packages/core into packages/ui.
