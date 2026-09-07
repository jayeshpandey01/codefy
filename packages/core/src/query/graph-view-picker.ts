import type { ChatGraphViewMode, Finding, QueryAST } from "@whoami/types";

const SUPPLY_CHAIN_KEYWORDS = ["depend", "package", "supply chain"];
const BLAST_RADIUS_KEYWORDS = ["affect", "impact", "blast", "downstream", "how bad"];

/**
 * Picks which of the 6 existing graph views (packages/ui/src/visualization)
 * a chat answer should open — see docs/CHAT-QUERY-ENGINE-SPEC.md §B.8. The
 * app shell already knows how to switch to any of these; this only decides
 * *which one* fits the question, reusing views rather than inventing new
 * visualizations.
 */
export function pickGraphViewMode(
  ast: QueryAST,
  finding?: Finding,
): ChatGraphViewMode {
  if (
    finding?.scope === "orchestrator" ||
    finding?.id.startsWith("remote-") ||
    finding?.ruleId.startsWith("remote-")
  ) {
    return "remote";
  }

  if (ast.intent === "SHOW_GRAPH_PATH") {
    return "graph";
  }

  if (
    ast.intent === "EXPLAIN_FINDING" &&
    finding?.trace.steps.some((step) => step.role === "sanitizer")
  ) {
    return "control_flow";
  }

  const normalized = ast.rawQuery.toLowerCase();

  if (SUPPLY_CHAIN_KEYWORDS.some((k) => normalized.includes(k))) {
    return "supply_chain";
  }

  if (BLAST_RADIUS_KEYWORDS.some((k) => normalized.includes(k))) {
    return "blast_radius";
  }

  return "graph";
}
