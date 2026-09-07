import type {
  ChatResult,
  Finding,
  FindingFilter,
  QueryAST,
  Severity,
  WorkspaceGraph,
} from "@whoami/types";

import { ALL_RULES, RULE_METADATA_BY_ID } from "../rules/registry.js";
import { parseQuery } from "./intent.js";
import { pickGraphViewMode } from "./graph-view-picker.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Mirrors API_ENDPOINTS.md's "Scan Profiles" table — the orchestrator's real
 * capability, separate from and complementary to the local static rules
 * above. FIND_RULE_COVERAGE must describe both, not just the local ones,
 * since "what do you scan for?" is otherwise a materially incomplete answer
 * about this app.
 */
const ORCHESTRATOR_SCAN_PROFILES: ReadonlyArray<{ readonly name: string; readonly tool: string }> = [
  { name: "recon", tool: "httpx" },
  { name: "web-discovery", tool: "httpx" },
  { name: "network-portscan", tool: "nmap" },
  { name: "fast-portscan", tool: "masscan" },
  { name: "content-discovery", tool: "ffuf" },
  { name: "vuln-assessment", tool: "nuclei" },
];

/**
 * Suggestions must never reference a made-up finding id — real Finding.id
 * values here are `filePath:line:ruleId` (see taint/propagate.ts), which are
 * too long/messy to type by hand and vary per scan. So every id-shaped
 * example is phrased to rely on the "currently selected finding" fallback
 * (see resolveFinding below) instead of naming a specific id that may not
 * exist in this scan.
 */
function buildSuggestions(findings: readonly Finding[]): readonly string[] {
  const suggestions: string[] = [];
  const bySeverity = (["critical", "high", "medium", "low"] as const).find(
    (severity) => findings.some((f) => f.severity === severity),
  );
  suggestions.push(`Show ${bySeverity ?? "critical"} findings`);
  if (findings.length > 0) {
    suggestions.push("Why is this confirmed?");
  }
  suggestions.push("Which files have issues?", "What do you scan for?");
  return suggestions;
}

export interface ExecuteQueryOptions {
  readonly workspaceGraph?: WorkspaceGraph;
  /** The currently-selected finding in the app shell, if any — used when
   * EXPLAIN_FINDING/SHOW_GRAPH_PATH is asked without an explicit id (e.g.
   * "why is this critical?", referring to whatever's already open). */
  readonly selectedFindingId?: string;
}

function matchesFilter(finding: Finding, filter: FindingFilter): boolean {
  if (filter.severity && !filter.severity.includes(finding.severity)) return false;
  if (filter.status && !filter.status.includes(finding.status)) return false;
  if (filter.ruleId && finding.ruleId !== filter.ruleId) return false;
  if (filter.cwe && finding.cwe !== filter.cwe) return false;
  if (filter.sinkClass && finding.trace.sinkClass !== filter.sinkClass) return false;
  if (
    filter.filePathContains &&
    !finding.trace.steps.some((s) =>
      s.filePath.toLowerCase().includes(filter.filePathContains!.toLowerCase()),
    )
  ) {
    return false;
  }
  return true;
}

function filterFindings(
  findings: readonly Finding[],
  filter: FindingFilter | undefined,
): Finding[] {
  const matched = filter
    ? findings.filter((f) => matchesFilter(f, filter))
    : [...findings];
  return matched.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Resolves which finding a question refers to. Tries, in order: (1) an
 * exact id match — works for short/synthetic ids; (2) the rawQuery
 * containing a real finding's id verbatim — covers a user pasting a full
 * `filePath:line:ruleId` id, which parseQuery's regex-based extraction
 * can't isolate as one token (colons/backslashes aren't in that pattern);
 * (3) nothing — the caller falls back to "which finding?" rather than
 * guessing.
 */
function resolveFinding(
  findings: readonly Finding[],
  id: string | undefined,
  rawQuery: string,
): Finding | undefined {
  if (id) {
    const exact = findings.find((f) => f.id === id);
    if (exact) return exact;
  }
  return findings.find((f) => rawQuery.includes(f.id));
}

/**
 * Executes an already-compiled QueryAST against in-memory scan data — see
 * docs/CHAT-QUERY-ENGINE-SPEC.md §B.4/§B.6. Pure function: no fs, no
 * bridge, no React — callable identically from the VS Code webview and the
 * Tauri frontend.
 */
export function executeQuery(
  ast: QueryAST,
  findings: readonly Finding[],
  options: ExecuteQueryOptions = {},
): ChatResult {
  switch (ast.intent) {
    case "LIST_FINDINGS": {
      const matched = filterFindings(findings, ast.filter);
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: matched,
        graphViewMode: matched.length > 0 ? pickGraphViewMode(ast, matched[0]) : undefined,
        explanation:
          matched.length === 0
            ? "No findings matched that filter."
            : `${matched.length} finding(s) matched.`,
      };
    }

    case "FIND_FINDING_BY_ID": {
      const found = resolveFinding(findings, ast.findingId, ast.rawQuery);
      if (!found) {
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: ast.findingId
            ? `No finding with id "${ast.findingId}" in the current scan.`
            : "No finding id was given.",
          suggestions: buildSuggestions(findings),
        };
      }
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [found],
        graphViewMode: pickGraphViewMode(ast, found),
      };
    }

    case "EXPLAIN_FINDING":
    case "SHOW_GRAPH_PATH": {
      const id = ast.findingId ?? options.selectedFindingId;
      const found = resolveFinding(findings, id, ast.rawQuery);
      if (!found) {
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: id
            ? `No finding with id "${id}" in the current scan.`
            : 'Which finding? Select one first, then ask "why is this confirmed?"',
          suggestions: buildSuggestions(findings),
        };
      }

      const graphViewMode = pickGraphViewMode(ast, found);

      if (ast.intent === "SHOW_GRAPH_PATH") {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: [found],
          graphViewMode,
        };
      }

      const hasSanitizerStep = found.trace.steps.some((s) => s.role === "sanitizer");
      const explanationParts = [
        `Status: ${found.status.toUpperCase()}.`,
        `Severity: ${found.severity.toUpperCase()}.`,
      ];
      if (found.reason) explanationParts.push(found.reason);
      explanationParts.push(
        hasSanitizerStep
          ? "A sanitizer step exists on this path but did not resolve to a known-safe pattern."
          : "No sanitizer step was found on this path.",
      );

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [found],
        graphViewMode,
        explanation: explanationParts.join(" "),
      };
    }

    case "LIST_FILES_WITH_FINDINGS": {
      if (!options.workspaceGraph) {
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: "Workspace graph hasn't loaded yet — run a scan first.",
        };
      }

      const filePaths = options.workspaceGraph.nodes
        .filter((n) => n.type === "file" && (n.findingCount ?? 0) > 0)
        .map((n) => n.filePath);

      const matched = findings.filter((f) =>
        f.trace.steps.some((s) => filePaths.includes(s.filePath)),
      );

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: matched,
        explanation:
          filePaths.length === 0
            ? "No files with findings."
            : `${filePaths.length} file(s) have findings: ${filePaths.join(", ")}`,
      };
    }

    case "FIND_RULE_COVERAGE": {
      const rules = Object.values(RULE_METADATA_BY_ID);
      const lines = rules.map((r) => {
        const cwe = /cwe\/definitions\/(\d+)/i.exec(r.link)?.[1];
        return `✓ ${r.code}${cwe ? ` (CWE-${cwe})` : ""}`;
      });

      const orchestratorFindingCount = findings.filter(
        (f) => f.scope === "orchestrator" || f.id.startsWith("remote-"),
      ).length;

      const explanation = [
        `Local static analysis (JavaScript/TypeScript only, ${ALL_RULES.length} rule(s)):`,
        ...lines,
        "",
        "Remote authorized scanning (via the orchestrator, opt-in — requires a registered, " +
          "authorized target):",
        ...ORCHESTRATOR_SCAN_PROFILES.map((p) => `✓ ${p.name} (${p.tool})`),
        orchestratorFindingCount > 0
          ? `${orchestratorFindingCount} orchestrator finding(s) already in this scan.`
          : "No orchestrator scan has been run in this session yet.",
        "",
        "Not yet implemented: Python/Go local rules (documented, not built — see docs/DETECTION-ENGINE-SPEC.md §A.1), " +
          "dependency/CVE scanning, GitHub Actions analysis.",
      ].join("\n");

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [],
        explanation,
      };
    }

    case "SCAN_SUMMARY": {
      const confirmed = findings.filter((f) => f.status === "confirmed");
      const needsVerification = findings.filter((f) => f.status === "needs-verification");
      const discarded = findings.filter((f) => f.status === "discarded");

      const explanation =
        confirmed.length === 0
          ? `No confirmed findings under the ${ALL_RULES.length} currently-enabled rule(s). ` +
            `Needs-verification: ${needsVerification.length}. Discarded: ${discarded.length}.`
          : `${confirmed.length} confirmed, ${needsVerification.length} needs-verification, ` +
            `${discarded.length} discarded — ${findings.length} total findings under the ` +
            `${ALL_RULES.length} currently-enabled rule(s).`;

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: confirmed,
        explanation,
      };
    }
  }
}

/**
 * Compiles and executes a raw chat question in one call — the entry point
 * ChatPanel calls. Returns capability: "UNSUPPORTED" rather than guessing
 * when parseQuery can't map the text to any known intent (§B.9).
 */
export function runChatQuery(
  rawQuery: string,
  findings: readonly Finding[],
  options: ExecuteQueryOptions = {},
): ChatResult {
  const ast = parseQuery(rawQuery);
  if (!ast) {
    return {
      capability: "UNSUPPORTED",
      findings: [],
      explanation: "I couldn't map this to a supported query.",
      suggestions: buildSuggestions(findings),
    };
  }
  return executeQuery(ast, findings, options);
}
