import type { QueryAST, QueryIntent } from "@whoami/types";

import {
  extractFilter,
  extractFindingId,
  normalizeQuery,
} from "./entities.js";
import { BUG_WORDS } from "./synonyms.js";

const RULE_COVERAGE_PHRASES = [
  "do you check for",
  "do you scan for",
  "do you detect",
  "do you support",
  "what do you scan",
  "what do you check",
  "what do you support",
  "rule coverage",
  "coverage",
];

const SUMMARY_PHRASES = [
  "how many",
  "give me a summary",
  "scan summary",
  "summary",
  "overview",
];

const FILES_PHRASES = [
  "which files",
  "what files",
  "files with issues",
  "files have issues",
  "files have findings",
  "files with findings",
];

const GRAPH_PATH_PHRASES = [
  "show me the path",
  "show the path",
  "show path",
  "show graph",
  "trace this",
  "trace to the sink",
  "trace it",
];

const EXPLAIN_PHRASES = ["why is", "why did", "why does", "explain"];

/**
 * Compiles free-text into a QueryAST — see docs/CHAT-QUERY-ENGINE-SPEC.md
 * §B.6. Deliberately a fixed priority ladder of phrase checks, not a
 * general classifier: every branch is a plain substring test against
 * `normalized`, so behavior is fully predictable and testable per-intent.
 * Returns undefined when nothing matches — the caller must render that as
 * capability: "UNSUPPORTED" (§B.9), never guess an intent.
 */
export function parseQuery(rawQuery: string): QueryAST | undefined {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) return undefined;

  const findingId = extractFindingId(rawQuery);

  if (RULE_COVERAGE_PHRASES.some((p) => normalized.includes(p))) {
    return build("FIND_RULE_COVERAGE", rawQuery);
  }

  if (SUMMARY_PHRASES.some((p) => normalized.includes(p))) {
    return build("SCAN_SUMMARY", rawQuery);
  }

  if (FILES_PHRASES.some((p) => normalized.includes(p))) {
    return build("LIST_FILES_WITH_FINDINGS", rawQuery);
  }

  if (GRAPH_PATH_PHRASES.some((p) => normalized.includes(p))) {
    return build("SHOW_GRAPH_PATH", rawQuery, undefined, findingId);
  }

  if (EXPLAIN_PHRASES.some((p) => normalized.includes(p))) {
    return build("EXPLAIN_FINDING", rawQuery, undefined, findingId);
  }

  const filter = extractFilter(normalized, rawQuery);
  const hasBugWord = BUG_WORDS.some((w) => normalized.includes(w));

  if (findingId && !hasBugWord && !filter) {
    return build("FIND_FINDING_BY_ID", rawQuery, undefined, findingId);
  }

  if (hasBugWord || filter) {
    return build("LIST_FINDINGS", rawQuery, filter);
  }

  return undefined;
}

function build(
  intent: QueryIntent,
  rawQuery: string,
  filter?: QueryAST["filter"],
  findingId?: string,
): QueryAST {
  const ast: {
    intent: QueryIntent;
    rawQuery: string;
    filter?: QueryAST["filter"];
    findingId?: string;
  } = { intent, rawQuery };
  if (filter) ast.filter = filter;
  if (findingId) ast.findingId = findingId;
  return ast;
}
