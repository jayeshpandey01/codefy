import type { Finding, FindingStatus, Severity } from "./findings.js";
import type { SinkClass } from "./taint.js";

/**
 * The chat panel's supported intent grammar — deliberately small. See
 * docs/CHAT-QUERY-ENGINE-SPEC.md §B.6 for why each of these (and only
 * these) is answerable from data that already exists (Finding[] /
 * WorkspaceGraph), and §B.10 for the intents intentionally left out
 * (FIND_CALLERS, TRACE_DATAFLOW, FIND_DEPENDENCIES, FIND_PR_CHANGES, etc.)
 * because no call graph / dependency-CVE feed / PR-diff graph exists yet.
 */
export type QueryIntent =
  | "LIST_FINDINGS"
  | "FIND_FINDING_BY_ID"
  | "EXPLAIN_FINDING"
  | "SHOW_GRAPH_PATH"
  | "LIST_FILES_WITH_FINDINGS"
  | "FIND_RULE_COVERAGE"
  | "SCAN_SUMMARY";

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
  /** Kept verbatim for the "couldn't map this" fallback message and for
   * pickGraphViewMode's keyword heuristics (blast-radius / supply-chain
   * wording) — never re-parsed as a source of truth once the AST exists. */
  readonly rawQuery: string;
}

/**
 * Never a numeric confidence score — mirrors FindingStatus's tri-state
 * model (see CLAUDE.md's "Precision & Trust Over Volume" principle).
 * SUPPORTED means the intent mapped and executed (even with zero results);
 * PARTIALLY_SUPPORTED means the intent mapped but couldn't fully execute
 * (e.g. an unknown finding id, or a graph that hasn't loaded yet);
 * UNSUPPORTED means the question didn't map to any known intent at all.
 */
export type QueryCapability =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "UNSUPPORTED";

/**
 * Which of the 6 existing graph views (see packages/ui/src/visualization)
 * a chat answer should open — the app shell already knows how to switch to
 * any of these (see MainTabId in both App.tsx files); this is the subset a
 * chat answer can ever request opening.
 */
export type ChatGraphViewMode =
  | "graph"
  | "unified"
  | "blast_radius"
  | "control_flow"
  | "supply_chain"
  | "remote";

export interface ChatResult {
  readonly capability: QueryCapability;
  readonly intent?: QueryIntent;
  readonly findings: readonly Finding[];
  readonly graphViewMode?: ChatGraphViewMode;
  readonly explanation?: string;
  /** Shown on UNSUPPORTED/PARTIALLY_SUPPORTED — example phrasings the user could try instead. */
  readonly suggestions?: readonly string[];
}
