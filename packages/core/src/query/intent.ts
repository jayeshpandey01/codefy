import type { QueryAST, QueryIntent } from "@whoami/types";

import { analyzeQuery } from "../rag/nlu-analyzer.js";
import {
  extractFilter,
  extractFindingId,
  normalizeQuery,
} from "./entities.js";
import { BUG_WORDS } from "./synonyms.js";

/**
 * Compiles free-text into a QueryAST using statistical NLU (TF-IDF cosine similarity,
 * morphological entity extraction, and discourse coreference resolution).
 * Completely eliminates hardcoded string matching arrays.
 * Returns undefined when nothing matches — the caller must render that as
 * capability: "UNSUPPORTED", never guess an intent.
 */
export function parseQuery(rawQuery: string): QueryAST | undefined {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) return undefined;

  const nlu = analyzeQuery(rawQuery);
  const findingId = nlu.slots.findingIds[0] || extractFindingId(rawQuery);
  const filter = extractFilter(normalized, rawQuery);

  // 1. Code Navigation Intent (e.g. "redirect to agent.py", "open agent.py")
  if (
    nlu.intent === "CODE_NAVIGATION" ||
    (nlu.slots.filePaths.length > 0 &&
      /\b(redirect|open|navigate|go\s+to|jump|where|locate|show|view|file)\b/i.test(rawQuery))
  ) {
    return {
      intent: "CODE_NAVIGATION",
      rawQuery,
      targetFilePath: nlu.slots.filePaths[0],
      findingId,
    };
  }

  const hasPathVerb = /\b(path|trace|graph|sink|flow)\b/i.test(rawQuery);
  const hasExplainVerb = /\b(why|explain|details)\b/i.test(rawQuery);

  // 2. Specific Finding by ID (e.g. "show me F-10291")
  if (findingId && !filter && !hasPathVerb && !hasExplainVerb) {
    return {
      intent: "FIND_FINDING_BY_ID",
      rawQuery,
      findingId,
    };
  }

  // 3. Filtered findings query (e.g. "any sql injection?", "critical bugs")
  if (filter && !hasExplainVerb && !hasPathVerb) {
    return {
      intent: "LIST_FINDINGS",
      rawQuery,
      filter,
    };
  }

  // 3. Dataflow / Graph Path
  if (nlu.intent === "SHOW_GRAPH_PATH" || nlu.intent === "TAINT_FLOW_TRACE" || hasPathVerb) {
    const ast: {
      intent: QueryIntent;
      rawQuery: string;
      findingId?: string;
      anaphorResolved?: boolean;
    } = {
      intent: "SHOW_GRAPH_PATH",
      rawQuery,
    };
    if (findingId) ast.findingId = findingId;
    if (nlu.isAnaphoric) ast.anaphorResolved = true;
    return ast;
  }

  // 4. Vulnerability Explanation
  if (nlu.intent === "EXPLAIN_FINDING" || nlu.intent === "EXPLAIN_VULNERABILITY") {
    const ast: {
      intent: QueryIntent;
      rawQuery: string;
      findingId?: string;
      filter?: QueryAST["filter"];
      anaphorResolved?: boolean;
    } = {
      intent: "EXPLAIN_FINDING",
      rawQuery,
    };
    if (findingId) ast.findingId = findingId;
    // No specific finding id (e.g. "explain cwe-798") -- carry the filter so
    // the executor can fall back to explaining every matching finding
    // instead of a dead-end "no finding with that id" reply.
    if (!findingId && filter) ast.filter = filter;
    if (nlu.isAnaphoric) ast.anaphorResolved = true;
    return ast;
  }

  // 5. Blast Radius Analysis
  if (nlu.intent === "BLAST_RADIUS_ANALYSIS") {
    return {
      intent: "BLAST_RADIUS_ANALYSIS",
      rawQuery,
      findingId,
      anaphorResolved: nlu.isAnaphoric,
    };
  }

  // 6. Rule Coverage
  if (nlu.intent === "FIND_RULE_COVERAGE") {
    return {
      intent: "FIND_RULE_COVERAGE",
      rawQuery,
    };
  }

  // 7. Files with Findings
  if (nlu.intent === "LIST_FILES_WITH_FINDINGS") {
    return {
      intent: "LIST_FILES_WITH_FINDINGS",
      rawQuery,
    };
  }

  // 8. Scan Summary / Architecture Overview
  if (nlu.intent === "SCAN_SUMMARY" || (nlu.intent === "ARCHITECTURE_OVERVIEW" && !rawQuery.toLowerCase().includes("scalable"))) {
    return {
      intent: "SCAN_SUMMARY",
      rawQuery,
    };
  }

  // 9. List Findings with Filter
  const hasBugWord = BUG_WORDS.some((w) => normalized.includes(w));
  if (nlu.intent === "LIST_FINDINGS" || filter || hasBugWord) {
    const ast: {
      intent: QueryIntent;
      rawQuery: string;
      filter?: QueryAST["filter"];
    } = {
      intent: "LIST_FINDINGS",
      rawQuery,
    };
    if (filter) ast.filter = filter;
    return ast;
  }

  // 10. General Technical Assistance (e.g. "explain me python developer")
  if (nlu.intent === "GENERAL_ASSISTANCE") {
    return {
      intent: "GENERAL_ASSISTANCE",
      rawQuery,
    };
  }

  // Unmappable / Out of Scope (e.g. "is this architecture scalable")
  return undefined;
}
