# WhoAmI Chat Query Engine — Research & Implementation Plan

Durable reference for the **chat panel** feature: a natural-language query interface that fills the existing, already-scaffolded **Right Section** in both `apps/desktop-app/src/App.tsx` and `apps/vscode-extension/src/webview/main.tsx` (currently rendered as a blank placeholder — see the `isRightSectionOpen` state and the `<PanelRightIcon />` empty state in both files). This doc is the "what" and "why"; implementation should also load `.claude/skills/taint-engine/SKILL.md` and `.claude/skills/webview-bridge/SKILL.md` for the "how" of the pipelines it plugs into.

This spec exists because `chatbot_plan.md` (repo root) sketched a much larger vision — a repo-wide, GitHub-App-shaped "LLM-free deterministic code intelligence engine" with a Code Property Graph, dependency/OSV intelligence, a GitHub Actions security graph, and PR-diff-aware re-scanning. That vision is sound *in the abstract*, but WhoAmI today is a single-workspace, local VS Code/Tauri tool (per `CLAUDE.md`), and most of the infrastructure that plan assumes does not exist yet. §B.2 records exactly what's real vs. assumed so this plan builds on ground truth instead of re-deriving chatbot_plan.md's 75-edge-case brainstorm as if it were already-built infrastructure.

**Scope decision (confirmed):** this is a new feature on WhoAmI itself — a chat panel in the Right Section — not a separate product. Research here is internal/codebase-grounded only; external tool-landscape research (CodeQL/Semgrep/OSV/etc.) is already covered where relevant in `docs/DETECTION-ENGINE-SPEC.md` §A.0 and isn't re-litigated here.

---

## B.0 The core design principle, carried over from chatbot_plan.md

The one idea from `chatbot_plan.md` worth preserving unchanged:

> Every chat answer must correspond to an actual, executed query over real data — never a generated-from-memory answer — and every finding referenced must have a navigable evidence path back to exact code (and, per the multi-graph requirement below, to the graph view that actually visualizes it).

This is also just `CLAUDE.md`'s "Precision & Trust Over Volume" principle applied to a chat UI instead of a finding card. Per **Purba et al. 2024** (already cited in `docs/DETECTION-ENGINE-SPEC.md` §A.0), open-ended natural-language-to-answer generation is exactly the failure mode WhoAmI's architecture is designed to avoid — so the chat panel compiles user text into a **deterministic Query AST**, executes it against real in-memory data, and renders a structured result. No LLM is in this loop, matching `ILlmTriageProvider`'s narrow-question precedent (it stays reserved for sanitizer/patch classification, never repurposed as a chat backend).

---

## B.1 Grounding — what already exists today

| Component | Where | Relevant shape |
|---|---|---|
| `Finding` | `packages/types/src/findings.ts` | `id, ruleId, status (confirmed\|needs-verification\|discarded), severity (critical\|high\|medium\|low), title, description, cwe?, trace, reason?, hint?, fix?, link?, scope?, code?` |
| `TaintTrace` / `TaintStep` | `packages/types/src/taint.ts` | `steps: {role, label, filePath, line}[]`, `sinkClass`. `role` includes `source\|sink\|sanitizer\|passthrough\|...` |
| `WorkspaceGraph` | `packages/types/src/graph.ts` | `nodes: {id, label, type: directory\|file\|class\|function\|module, filePath, line?, findingCount?, highestSeverity?}`, `edges: {type: contains\|imports\|calls\|defines}` |
| `UnifiedGraph` | `packages/types/src/graph.ts` | Merged `WorkspaceGraph` + taint-role nodes/edges (superset used by the "Unified Architecture" view) |
| Orchestrator types | `packages/types/src/orchestrator.ts` | `ScanRead` (status, profile), `TargetRead`, `ScanResultRead.summary` (risk_summary counts, findings[], technologies[]) — remote authorized-pentest scan data, not local code |
| `BridgeMessage` | `packages/types/src/bridge.ts` | Existing message types: `scan-workspace-*`, `get-trace-*`, `get-workspace-graph-*`, `apply-fix-*`, `run-poc-*`, `jump-to-line`, `register-target-*`, `submit/poll/cancel-remote-scan-*`, `list-audit-events-*` |
| Query-relevant core modules | `packages/core/src/` | `engine.ts` (scan orchestration), `taint/*` (propagate, sanitizer-filter, sanitizers, sinks, sources), `graph/workspace-graph.ts`, `rules/registry.ts` (5 JS/TS rules today: command-injection, SQL injection, SSRF, path traversal, code injection), `orchestrator/*` (remote scan client), `logging/*` (structured `Logger`, already used for audit-style events) |
| The 5 existing graph views | `packages/ui/src/visualization/` | `GraphContainer` (data-flow DAG), `UnifiedInterconnectedGraphView`, `BlastRadiusGraphView`, `ControlFlowGraphView`, `DependencySupplyChainGraphView`, `RemoteAttackSurfaceGraphView` — all already accept `findings`/`workspaceGraph`/`onNodeClick`/`onJumpToLine`/`direction`/`pipelineMode` |
| The app shell | `apps/desktop-app/src/App.tsx` + `apps/vscode-extension/src/webview/main.tsx` | Near-identical shells: left `IssueTreeSidebar` (resizable), center `ScrollableTabsBar` + one of the 6 tab views, **and a right `isRightSectionOpen` panel, currently an empty placeholder** — this is where the chat panel goes |
| Selection → graph pattern (already proven) | Both `App.tsx` files, `handleSelectFinding` | Clicking a finding in `IssueTreeSidebar` already does `setSelectedFinding` + `setShowFloatingDetail(true)` + `setGraphViewMode("selected")` + `openTab("graph")` — i.e. **selecting an item already drives which graph view is shown and what's highlighted in it**. The chat panel should reuse this exact pattern, not invent a new one. |

**Key existing fact that simplifies everything:** by the time a user could ask a question, `findings: Finding[]` and `workspaceGraph: WorkspaceGraph` are already fully loaded into the webview's React state (populated by `scan-workspace-result` / `get-workspace-graph-result`). Querying them does **not** require a new round-trip through the bridge — it's client-side filtering/lookup over data already in memory, matching `packages/ui`'s "no platform-specific code" constraint perfectly (a query executor here needs zero VS Code or Tauri APIs).

---

## B.2 Gap analysis — what chatbot_plan.md assumes vs. what exists

| chatbot_plan.md assumes | Reality in this codebase | Disposition |
|---|---|---|
| A Code Property Graph (AST+CFG+DFG+Call Graph) queryable independent of any one finding | `TaintTrace.steps` gives a linear source→sink path *per finding*; `WorkspaceGraph`/`UnifiedGraph` give file/module/class/function structural nodes with `contains/imports/calls/defines` edges, not a general interprocedural CFG/DFG a query could traverse arbitrarily | **Out of scope for this feature.** Chat queries must be answerable from `Finding[]` + `WorkspaceGraph`/`UnifiedGraph` as they exist today — no new graph algorithms in this pass. |
| Dependency/OSV vulnerability intelligence | Not implemented anywhere in `packages/core`; `DependencySupplyChainGraphView` is a visual *treatment* (package/source/sink node styling), not a real dependency-CVE feed | Out of scope. A "what depends on lodash" or "any known CVEs" query has no backing data source yet — must fall back honestly (§B.9), not be silently unsupported. |
| GitHub Actions workflow security graph | Not implemented | Out of scope — no workflow/job/step/permission types exist in `packages/types` today. |
| Multi-repo / GitHub App ingestion, PR base/head diffing | WhoAmI scans one local workspace folder (`scan-workspace-request.folderPath`) | Out of scope — this feature operates on the currently-scanned workspace's findings, nothing more. |
| A rule engine with dozens of languages/rules | `ALL_RULES` in `rules/registry.ts` currently has exactly 5 JS/TS rules; Python/Go rows in `docs/DETECTION-ENGINE-SPEC.md` §A.1 are documented but unimplemented | Chat's "coverage" self-report (§B.9) must reflect this real number, not the aspirational table. |
| Numeric/black-box confidence scores | `FindingStatus` is an explicit tri-state (`confirmed \| needs-verification \| discarded`) — no numeric confidence anywhere in the type system | **Already aligned** — chat must never synthesize a percentage; reuse the tri-state, exactly as `CLAUDE.md` mandates. |
| A severity/risk breakdown ("why CRITICAL": reachability × sensitivity × privilege × exposure) as first-class fields | `Finding` has no such structured fields, but does carry `reason?`/`hint?` (free text, already populated per rule in `RULE_METADATA_BY_ID`) and `trace.steps[].role` (so "was there a sanitizer step on this path" is already computable) | **Partially aligned.** A deterministic "why" can be built today from `reason` + a `steps.some(s => s.role === "sanitizer")` check + `status` — see §B.6's `EXPLAIN_FINDING` intent. No schema change required for v1. |

---

## B.3 Reframed research questions

chatbot_plan.md's RQ1–RQ7 assumed repo-wide infrastructure. Scoped down to what this codebase can actually test:

- **RQ1'** — Can a deterministic NL→QueryAST compiler answer useful questions about an *already-scanned single workspace's* findings and graph, without an LLM, at acceptable precision (no hallucinated intent mapping — an unmapped question must say so, never guess)?
- **RQ2'** — Does routing a chat answer to the *matching* existing graph view (§B.8) rather than always defaulting to the plain data-flow DAG measurably improve "time to understand a finding," compared to the current click-a-card-in-the-sidebar flow?
- **RQ3'** — What fraction of realistic developer questions about local findings ("show critical bugs," "why is this confirmed," "where's the SQL injection") are answerable from the *existing* `Finding`/`WorkspaceGraph` shape vs. requiring new fields or new detectors?

---

## B.4 Architecture

```text
User types question in ChatPanel (Right Section)
              │
              ▼
   Tokenizer + Intent Grammar        ── packages/core/src/query/ (new, pure TS,
              │                          no UI/platform imports — mirrors taint/* style)
              ▼
        Entity Resolver
   (severity words, rule/CWE names,
    file-path fragments, finding IDs)
              │
              ▼
          Query AST
              │
              ▼
        Query Executor
  runs directly against the Finding[]
  / WorkspaceGraph / UnifiedGraph /
  ScanRead[] already held in the
  webview's React state — NO new
  bridge round-trip for pure retrieval
              │
              ▼
        ChatResult
  { intent, status: SUPPORTED |
    PARTIALLY_SUPPORTED | UNSUPPORTED,
    findings: Finding[], graphViewMode,
    explanation? }
              │
              ▼
   ChatPanel renders result cards,
   each with a "Show Path" button that
   calls the SAME callbacks App.tsx
   already passes to IssueTreeSidebar
   (setSelectedFinding, setGraphViewMode,
    openTab, handleJumpToLine)
```

**Where the query executor lives:** `packages/core/src/query/` — pure functions operating on plain `Finding[]`/`WorkspaceGraph` values passed in as arguments, no `fs`, no bridge, no React. This lets it be unit-tested with vitest exactly like `taint/sanitizer-filter.ts` is (§B.12), and reused identically by both the VS Code webview and the Tauri frontend without any platform branching — consistent with `packages/core`'s "no UI imports" rule.

**Where the UI lives:** a new `ChatPanel` component in `packages/ui/src/components/ChatPanel.tsx`, exported from `packages/ui/src/index.ts` alongside the other components. It replaces the placeholder `<div>` currently inside `isRightSectionOpen` in both `App.tsx` files. Per `CLAUDE.md`'s host-boundary rule, `ChatPanel` itself stays platform-agnostic; **the app shell (`App.tsx`) is what wires it to the same handlers `IssueTreeSidebar` already receives** — `onSelectFinding`, `openTab`, `setGraphViewMode`, `layoutDirection` — so `ChatPanel` needs no new bridge messages for the retrieval intents in §B.6.

**Bridge messages:** none required for v1's retrieval-only intents (Type A/B/C below — see B.6). Action-shaped questions ("scan again," "run orchestrator scan on X," "apply the fix for F-123") route through the **existing** `scan-workspace-request`, `submit-remote-scan-request`, `apply-fix-request`, etc. — the chat panel becomes another caller of bridge messages that already exist, not a reason to add new ones. A `chat-query-request/result` `BridgeMessage` pair is **deferred, optional**: only worth adding later if a query needs host-side data the webview doesn't already hold (e.g. full-text search over file contents not present in any `Finding`), which is explicitly out of scope for v1 (§B.10 covers why "arbitrary keyword search over source" isn't attempted here).

---

## B.5 Query AST — new types in `packages/types`

```ts
// packages/types/src/chat-query.ts (new file)

export type QueryIntent =
  | "LIST_FINDINGS"          // optionally filtered
  | "FIND_FINDING_BY_ID"
  | "EXPLAIN_FINDING"        // "why is F-123 critical / confirmed?"
  | "SHOW_GRAPH_PATH"        // "show me the path for F-123"
  | "LIST_FILES_WITH_FINDINGS"
  | "FIND_RULE_COVERAGE"     // "do we check for X?" -> capability report
  | "SCAN_SUMMARY";          // "how many issues did we find?"

export interface FindingFilter {
  readonly severity?: readonly Severity[];
  readonly status?: readonly FindingStatus[];
  readonly ruleId?: string;
  readonly cwe?: string;
  readonly sinkClass?: SinkClass;
  readonly filePathContains?: string;
}

export interface QueryAST {
  readonly intent: QueryIntent;
  readonly filter?: FindingFilter;
  readonly findingId?: string;
  readonly rawQuery: string; // kept for the "couldn't map this" fallback message
}

export type QueryCapability = "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED";

export interface ChatResult {
  readonly capability: QueryCapability;
  readonly intent?: QueryIntent;
  readonly findings: readonly Finding[];
  /** Which existing graph view mode this answer should open, if any — see §B.8 */
  readonly graphViewMode?: "graph" | "unified" | "blast_radius" | "control_flow" | "supply_chain" | "remote";
  readonly explanation?: string;
  readonly suggestions?: readonly string[]; // shown on UNSUPPORTED, mirrors chatbot_plan.md's fallback UX
}
```

These stay in `packages/types` per the contract-first principle — `packages/core`'s executor and `packages/ui`'s `ChatPanel` both import from here, never redeclare.

---

## B.6 Supported intent grammar (v1 — deliberately small)

| Intent | Example phrasing | Data source | Confidence this is answerable today |
|---|---|---|---|
| `LIST_FINDINGS` | "show critical bugs", "any SQL injection?", "what's confirmed vs unverified" | `Finding[]` filter on `severity`/`status`/`ruleId`/`cwe` | High — every field already exists |
| `FIND_FINDING_BY_ID` | "show me F-10291" | `Finding[]` lookup by `id` | High |
| `EXPLAIN_FINDING` | "why is this critical?", "why is F-10291 confirmed?" | `Finding.reason` + `Finding.status` + `trace.steps.some(s => s.role === 'sanitizer')` | High — computable from existing fields, no schema change |
| `SHOW_GRAPH_PATH` | "show me the path", "trace this to the sink" | `Finding.trace` → drives graph view (§B.8) | High |
| `LIST_FILES_WITH_FINDINGS` | "which files have issues?" | `WorkspaceGraph.nodes` filtered by `findingCount > 0` | High |
| `FIND_RULE_COVERAGE` | "do you check for XSS?", "what do you scan for?" | Static report generated from `rules/registry.ts` + `RULE_METADATA_BY_ID` — **must say "no" honestly for anything not in the 5-rule list**, per §B.2 | High, and important for trust (mirrors chatbot_plan.md edge case #50) |
| `SCAN_SUMMARY` | "how many issues", "give me a summary" | `Finding[]` counts by severity/status, matching chatbot_plan.md edge case #51's "never say secure, report what was actually checked" | High |

Deliberately **not** attempted in v1 (each needs infrastructure from §B.2 that doesn't exist): `FIND_CALLERS`/`FIND_CALLEES` (no call graph beyond a finding's own trace), `TRACE_DATAFLOW` between two arbitrary symbols (no general DFG), `FIND_DEPENDENCIES`/CVE lookups (no OSV integration), `FIND_PR_CHANGES` (no diffing). A question mapping to one of these should resolve to `capability: "UNSUPPORTED"` with a specific reason, never silently ignored.

---

## B.7 Synonym dictionary (small, concrete)

```ts
// packages/core/src/query/synonyms.ts
export const SEVERITY_SYNONYMS: Record<string, Severity> = {
  critical: "critical", crit: "critical", p0: "critical", severe: "critical",
  high: "high", important: "high",
  medium: "medium", moderate: "medium",
  low: "low", minor: "low", info: "low",
};

export const BUG_WORD_SYNONYMS = ["bug", "bugs", "vulnerability", "vulnerabilities", "issue", "issues", "finding", "findings", "problem", "problems"];

export const STATUS_SYNONYMS: Record<string, FindingStatus> = {
  confirmed: "confirmed", verified: "confirmed",
  "needs-verification": "needs-verification", unverified: "needs-verification", unresolved: "needs-verification",
  discarded: "discarded", dismissed: "discarded", "false positive": "discarded", "false-positive": "discarded",
};

export const CWE_SINK_SYNONYMS: Record<string, SinkClass> = {
  "sql injection": "sql-injection", sqli: "sql-injection",
  "command injection": "command-injection", rce: "command-injection",
  ssrf: "ssrf",
  "path traversal": "path-traversal", "directory traversal": "path-traversal",
  "code injection": "code-injection", eval: "code-injection",
  "prototype pollution": "prototype-pollution",
};
```

Kept as plain `Record` lookups, not a general NLP library — matches the "no external runtime" and "deterministic" constraints exactly, and is trivially unit-testable.

---

## B.8 Evidence & graph linking — the multi-graph-view requirement

This directly answers the mid-task ask: **a chat answer should open the graph view that actually shows the thing being asked about**, reusing the 6 existing views rather than inventing a new visualization.

| `QueryAST.intent` / finding characteristics | Graph view opened (existing component) | Why this one |
|---|---|---|
| `SHOW_GRAPH_PATH`, or any `LIST_FINDINGS` result the user drills into | `graph` (`GraphContainer`, data-flow DAG) — `graphViewMode: "selected"` | Direct source→sink path is exactly what this view already renders per finding |
| `EXPLAIN_FINDING` where the trace shows a sanitizer step that didn't hold, or user asks "how is this reachable" | `control_flow` (`ControlFlowGraphView`) | This view is purpose-built for sanitizer/decision-gate reasoning — matches `resolveSanitizerStatus`'s own model |
| Question implies impact/downstream reasoning ("what else does this affect", "how bad is this") | `blast_radius` (`BlastRadiusGraphView`) | Already models impact radius from a finding |
| Question mentions a package/dependency name | `supply_chain` (`DependencySupplyChainGraphView`) | Closest existing view, though see §B.2 — it's a visual treatment, not real CVE data, so the chat's `explanation` must not overclaim dependency-vulnerability detection |
| Question is about the orchestrator/remote scan results | `remote` (`RemoteAttackSurfaceGraphView`) | Matches `scope === "orchestrator"` findings already routed here today |
| Broad "show me the architecture" / multi-finding overview questions | `unified` (`UnifiedInterconnectedGraphView`) | Already the "show everything at once" view |

Implementation-wise, this table becomes a pure function `pickGraphViewMode(query: QueryAST, finding?: Finding): MainTabId` in `packages/core/src/query/`, and `ChatPanel`'s "Show Path" button calls the app shell's existing `openTab(mode)` + `setSelectedFinding(finding)` + `setGraphViewMode("selected")` — the exact same three calls `handleSelectFinding` already makes for sidebar clicks. No new interaction pattern, just a new caller of the existing one.

---

## B.9 Fallback & capability UX

Directly reusing chatbot_plan.md edge cases #1, #2, #50, #51 (the strongest ideas in that document), scoped to real data:

```text
I couldn't map this to a supported query.

Try:
• Show critical findings
• Why is F-10291 confirmed?
• Which files have issues?
• What do you scan for?
```

`FIND_RULE_COVERAGE` responses must be generated from `ALL_RULES`/`RULE_METADATA_BY_ID`, e.g.:

```text
Currently checked (JavaScript/TypeScript only):
✓ Command Injection (CWE-78)
✓ SQL Injection (CWE-89)
✓ SSRF (CWE-918)
✓ Path Traversal (CWE-22)
✓ Code Injection (CWE-95)

Not yet implemented: Python/Go rules (documented, not built — see docs/DETECTION-ENGINE-SPEC.md §A.1),
dependency/CVE scanning, GitHub Actions analysis.
```

And `SCAN_SUMMARY` never says "secure" — mirrors edge case #51:

```text
No confirmed findings under the 5 currently-enabled rules.

Rules executed: 5
Files scanned: <n>
Needs-verification: <n>
```

---

## B.10 Edge cases actually relevant at this scope

Trimmed from chatbot_plan.md's ~60-case matrix to what applies when the data source is `Finding[]`/`WorkspaceGraph` for one already-scanned workspace, with an explicit reason for every drop:

| Kept | Why it applies here |
|---|---|
| Ambiguous/unmappable NL question (chatbot_plan #1) | Real risk with any grammar this small — must fall back, never guess |
| "Something completely new" capability classification (#2) | Same reason; `QueryCapability` tri-state directly implements this |
| False positives from a naive keyword match (#4-ish) | e.g. "sql" in a filename shouldn't trigger `sql-injection` filter — entity resolver must anchor on the synonym dictionary (§B.7), not raw substring match |
| Duplicate/near-duplicate results when a filter matches many findings (#41 in spirit) | `LIST_FINDINGS` can return many rows — result list needs the same severity-first ordering `IssueTreeSidebar` already uses, not a new ranking scheme |
| "No vulnerabilities found" honesty (#51) | Directly applicable — §B.9 |
| Rule coverage transparency (#50) | Directly applicable — §B.9, and must reflect the *real* 5-rule count, not the spec's aspirational table |
| Evidence/explanation without an LLM (#43, #47) | Directly applicable — §B.6's `EXPLAIN_FINDING`, computed from existing fields |

| Dropped | Why (from §B.2's gap table) |
|---|---|
| Interprocedural/call-graph questions (#8, #46 in chatbot_plan's numbering) | No call graph exists beyond a finding's own linear trace |
| Dependency/CVE version ambiguity (#13, #16) | No OSV/dependency-version data source exists |
| GitHub Actions / YAML expression contexts (#11, #12) | No workflow graph exists |
| PR/commit-diff comparison (#30–32, #55–58) | Single-workspace scan only, no BASE/HEAD graph diffing |
| Reflection/dynamic-dispatch resolution (#9) | Not relevant — chat queries findings, it doesn't do call resolution itself |
| Ambiguous function name disambiguation (#59) | `WorkspaceGraph` functions aren't a queryable target in v1 (no `FIND_FUNCTION` intent) |
| Vector/BM25 search (#58) | Overkill for a `Finding[]` array typically in the tens-to-low-hundreds; a synonym+field-filter match (§B.7) is sufficient and stays fully deterministic |

---

## B.11 Implementation roadmap

**Phase 0 — Types.** Add `packages/types/src/chat-query.ts` (§B.5); export from `packages/types/src/index.ts`.

**Phase 1 — Query core.** `packages/core/src/query/{tokenizer,intent,entities,synonyms,executor,graph-view-picker}.ts`. Pure functions: `parseQuery(text: string): QueryAST`, `executeQuery(ast: QueryAST, findings: readonly Finding[], graph?: WorkspaceGraph): ChatResult`, `pickGraphViewMode(ast, finding?): MainTabId`. Export all three from `packages/core/src/index.ts`.

**Phase 2 — ChatPanel UI.** `packages/ui/src/components/ChatPanel.tsx` — input box, message list, result cards reusing the existing `FindingCard`/`SeverityBadge` components rather than new ones. Export from `packages/ui/src/index.ts`.

**Phase 3 — Wire into the Right Section.** In both `App.tsx` files, replace the placeholder `<div>` inside `isRightSectionOpen` with `<ChatPanel findings={findings} workspaceGraph={workspaceGraph} onSelectFinding={handleSelectFinding} onSelectGraphView={(mode) => { setGraphViewMode("selected"); openTab(mode); }} />` — reusing handlers that already exist in the shell (note: `apps/desktop-app/src/App.tsx` doesn't currently track `workspaceGraph` state the way the VS Code webview does — it'll need the same `get-workspace-graph-request`/`result` wiring the extension already has, which is a small, independent fix worth landing first).

**Phase 4 — Test plan (see §B.12).**

**Phase 5 (future, separate initiative — not part of this feature) —** any of §B.2's gaps (dependency/OSV, GitHub Actions graph, PR diffing, general call graph) would need their own ADR and detector work before the chat grammar could honestly grow into chatbot_plan.md's full intent list. Explicitly not started as part of landing the chat panel.

---

## B.12 Test plan

Mirrors `docs/DETECTION-ENGINE-SPEC.md` §A.5's fixture-driven pattern:

```
packages/core/src/__tests__/query/parseQuery.test.ts
  "show critical bugs"            -> { intent: LIST_FINDINGS, filter: { severity: ["critical"] } }
  "why is F-10291 confirmed"      -> { intent: EXPLAIN_FINDING, findingId: "F-10291" }
  "do you check for xss"          -> { intent: FIND_RULE_COVERAGE }
  "is this architecture scalable" -> capability: UNSUPPORTED (no matching intent)

packages/core/src/__tests__/query/executeQuery.test.ts
  given a fixture Finding[] with 2 critical / 1 medium ->
    LIST_FINDINGS{severity:[critical]} returns exactly the 2 critical findings, ordered severity-first

packages/core/src/__tests__/query/pickGraphViewMode.test.ts
  EXPLAIN_FINDING on a finding whose trace has a sanitizer step -> "control_flow"
  SHOW_GRAPH_PATH -> "graph"
  finding.scope === "orchestrator" -> "remote"
```

Each test asserts an exact `QueryAST`/`ChatResult`/`MainTabId` — no partial-credit fuzzy assertions, consistent with how the taint-engine tests are already written.

---

## B.13 Explicitly not building now

Restating §B.2/§B.10's exclusions as a single list, mirroring chatbot_plan.md §71's own "don't build this yet" section, re-scoped to this feature:

- ❌ Any new detector/rule content (Python/Go rules, dependency/OSV, GitHub Actions) — separate initiative, needs its own spec + ADR
- ❌ A general call graph / interprocedural CFG/DFG query capability
- ❌ PR/commit diffing or multi-scan historical comparison
- ❌ A `chat-query` `BridgeMessage` — deferred until a query genuinely needs host-side data the webview doesn't already hold
- ❌ Vector embeddings / BM25 — unnecessary at this data scale and would reintroduce a dependency this project's principles explicitly avoid
- ❌ Any numeric confidence score — the tri-state `FindingStatus` stays the only "confidence" surface
