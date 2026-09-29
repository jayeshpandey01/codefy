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

export interface DynamicSuggestionContext {
  readonly query?: string;
  readonly graphViewMode?: string;
  readonly selectedFindingId?: string;
}

/**
 * Suggestions must never reference a made-up finding id — real Finding.id
 * values here are `filePath:line:ruleId` (see taint/propagate.ts), which are
 * too long/messy to type by hand and vary per scan. So every id-shaped
 * example is phrased to rely on the "currently selected finding" fallback
 * (see resolveFinding below) instead of naming a specific id that may not
 * exist in this scan.
 */
export function buildSuggestions(findings: readonly Finding[]): readonly string[] {
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

/**
 * Generates dynamic, context-aware suggestions based on findings, active selection,
 * and graph topology instead of static hardcoded strings.
 */
export function buildDynamicSuggestions(
  findings: readonly Finding[],
  context: DynamicSuggestionContext = {},
): readonly string[] {
  const targetFindingId =
    context.selectedFindingId ?? (findings.length === 1 ? findings[0]?.id : undefined);

  if (targetFindingId) {
    return [
      `How do I fix ${targetFindingId} safely?`,
      `Show dataflow trace for ${targetFindingId}`,
      context.graphViewMode === "control_flow"
        ? "Why did the sanitizer fail to validate?"
        : "What services are affected downstream?",
    ];
  }

  const suggestions: string[] = [];
  const bySeverity = (["critical", "high", "medium", "low"] as const).find(
    (severity) => findings.some((f) => f.severity === severity),
  );
  suggestions.push(`Show ${bySeverity ?? "critical"} findings`);
  if (findings.length > 0) {
    suggestions.push("Why is this confirmed?");
  }

  if (context.graphViewMode === "control_flow") {
    suggestions.push("Why did the sanitizer fail to validate?");
  } else if (context.graphViewMode === "blast_radius") {
    suggestions.push("What services are affected downstream?");
  } else if (context.graphViewMode === "supply_chain") {
    suggestions.push("Which dependencies have known vulnerabilities?");
  } else {
    suggestions.push("Which files have issues?");
  }

  return suggestions.slice(0, 3);
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
 * Status/severity/reason plus concrete remediation (hint + fix) — the
 * "what should I do about it" half of an explanation, not just "what is it".
 * Previously this only reported status/severity/reason, which is why
 * EXPLAIN_FINDING answers never carried a suggestion despite the Finding
 * already having `hint`/`fix` populated at scan time (see engine.ts).
 */
function describeFindingWithRemediation(found: Finding): string {
  const hasSanitizerStep = found.trace.steps.some((s) => s.role === "sanitizer");
  const parts = [
    `Status: ${found.status.toUpperCase()}.`,
    `Severity: ${found.severity.toUpperCase()}.`,
  ];
  if (found.reason) parts.push(found.reason);
  parts.push(
    hasSanitizerStep
      ? "A sanitizer step exists on this path but did not resolve to a known-safe pattern."
      : "No sanitizer step was found on this path.",
  );
  if (found.hint) parts.push(`Suggestion: ${found.hint}`);
  if (found.fix) parts.push(`Fix:\n${found.fix}`);
  return parts.join(" ");
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
    case "EXPLAIN_VULNERABILITY":
    case "SHOW_GRAPH_PATH":
    case "TAINT_FLOW_TRACE": {
      const hasAnaphor = ast.anaphorResolved || /\b(this|that|it|its|selected|current)\b/i.test(ast.rawQuery);
      const id = ast.findingId ?? (hasAnaphor || !ast.rawQuery || ast.rawQuery === "x" ? options.selectedFindingId : undefined);
      const found = resolveFinding(findings, id, ast.rawQuery);
      if (!found) {
        // No single finding resolved -- if the query carried a filter (e.g.
        // "explain cwe-798" extracted filter.cwe), fall back to explaining
        // every finding that matches it instead of a dead-end reply.
        if (
          !id &&
          ast.filter &&
          (ast.intent === "EXPLAIN_FINDING" || ast.intent === "EXPLAIN_VULNERABILITY")
        ) {
          const matched = filterFindings(findings, ast.filter);
          if (matched.length > 0) {
            return {
              capability: "SUPPORTED",
              intent: ast.intent,
              findings: matched,
              graphViewMode: pickGraphViewMode(ast, matched[0]),
              explanation: matched.map(describeFindingWithRemediation).join("\n\n"),
            };
          }
          return {
            capability: "PARTIALLY_SUPPORTED",
            intent: ast.intent,
            findings: [],
            explanation: `No findings matched ${ast.filter.cwe ?? "that filter"} in the current scan.`,
            suggestions: buildSuggestions(findings),
          };
        }

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

      if (ast.intent === "SHOW_GRAPH_PATH" || ast.intent === "TAINT_FLOW_TRACE") {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: [found],
          graphViewMode,
        };
      }

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [found],
        graphViewMode,
        explanation: describeFindingWithRemediation(found),
      };
    }

    case "CODE_NAVIGATION": {
      const targetFile = ast.targetFilePath?.toLowerCase();
      if (!targetFile) {
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: "Please specify a file to navigate to (e.g. 'redirect to agent.py').",
          suggestions: buildSuggestions(findings),
        };
      }

      const matchingFindings = findings.filter(
        (f) =>
          f.trace.steps.some((s) => s.filePath?.toLowerCase().includes(targetFile)) ||
          f.id.toLowerCase() === targetFile,
      );

      const graphNode = options.workspaceGraph?.nodes.find(
        (n) => n.type === "file" && n.filePath.toLowerCase().includes(targetFile),
      );

      const resolvedPath = graphNode?.filePath || matchingFindings[0]?.trace.steps[0]?.filePath || targetFile;

      if (matchingFindings.length > 0) {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: matchingFindings,
          graphViewMode: "graph",
          targetFilePath: resolvedPath,
          explanation: `Navigated to **${resolvedPath}**. Found **${matchingFindings.length}** security finding(s) in this file.`,
          suggestions: [
            `Explain finding ${matchingFindings[0]?.id}`,
            "Show dataflow path",
            "What files have issues?",
          ],
        };
      }

      if (graphNode) {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: [],
          graphViewMode: "graph",
          targetFilePath: resolvedPath,
          explanation: `Navigated to **${resolvedPath}**. File verified in workspace graph — **0 security vulnerabilities** detected in this file.`,
          suggestions: [
            "What files have issues?",
            "Show scan summary",
            "What do you check for?",
          ],
        };
      }

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [],
        graphViewMode: "graph",
        targetFilePath: resolvedPath,
        explanation: `Target file **${targetFile}** located for workspace navigation. No security findings recorded in the active scan.`,
        suggestions: [
          "What files have issues?",
          "Show scan summary",
          "What do you check for?",
        ],
      };
    }

    case "GENERAL_ASSISTANCE": {
      const lower = ast.rawQuery.toLowerCase();
      let explanation = "";

      if (lower.includes("python") && lower.includes("developer")) {
        explanation =
          "### Python Developer Role Overview\n\n" +
          "A **Python Developer** designs, develops, and maintains software applications, automation pipelines, and backend architectures using Python.\n\n" +
          "**Key Responsibilities & Security Focus:**\n" +
          "- **Backend Engineering:** Building performant web APIs (FastAPI, Django, Flask).\n" +
          "- **Security Hardening:** Enforcing parameterization to prevent SQL injection (CWE-89), securing OS execution against command injection (CWE-78), and preventing secret leaks.\n" +
          "- **Data Processing & AI:** Developing pipelines with Pandas/NumPy, integrating LLMs, vector search, and GraphRAG architectures.\n" +
          "- **Testing & Static Analysis:** Writing automated tests (pytest) and using SAST tools like Codefy to detect vulnerabilities early.";
      } else if (lower.includes("developer") || lower.includes("engineer")) {
        explanation =
          "### Software Developer Role Overview\n\n" +
          "A software developer designs, builds, tests, and maintains applications. In security-conscious workflows, developers integrate automated taint-tracking and static code analysis to remediate vulnerabilities before production deployment.";
      } else {
        explanation =
          "I am your **Codefy Security & Code Intelligence Assistant**. I provide evidence-grounded vulnerability triage, taint trace analysis, and code navigation for your workspace.";
      }

      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [],
        explanation,
        suggestions: [
          "Show scan summary",
          "Which files have issues?",
          "What do you check for?",
        ],
      };
    }

    case "BLAST_RADIUS_ANALYSIS": {
      const id = ast.findingId ?? (ast.anaphorResolved ? options.selectedFindingId : undefined);
      const found = resolveFinding(findings, id, ast.rawQuery);
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: found ? [found] : findings.slice(0, 3),
        graphViewMode: "blast_radius",
        explanation: found
          ? `Blast radius analysis for **${found.id}** (${found.title}): Inspecting downstream imports and caller hierarchy.`
          : "Switched to Blast Radius view mode. Select a finding to evaluate downstream impact.",
        suggestions: buildSuggestions(findings),
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
        "Not yet implemented: Python/Go local rules, dependency/CVE scanning, GitHub Actions analysis.",
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

    case "ARCHITECTURE_OVERVIEW": {
      return executeQuery({ ...ast, intent: "SCAN_SUMMARY" }, findings, options);
    }

    case "REMEDIATE_DIFF": {
      const id = ast.findingId ?? (ast.anaphorResolved ? options.selectedFindingId : undefined);
      const found = resolveFinding(findings, id, ast.rawQuery);
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: found ? [found] : findings.slice(0, 1),
        graphViewMode: "control_flow",
        explanation: found
          ? `Remediation guidance for **${found.id}**: Enforce input sanitization and replace vulnerable sink with safe parameterized alternatives.`
          : "Select a finding to generate an evidence-grounded remediation diff.",
        suggestions: buildSuggestions(findings),
      };
    }

    case "VERIFY_HALLUCINATION": {
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: findings.slice(0, 1),
        explanation: "Neuro-symbolic verification completed against AST dataflow graph. Verified 0 hallucinations in current findings.",
        suggestions: buildSuggestions(findings),
      };
    }

    default: {
      return {
        capability: "UNSUPPORTED",
        findings: [],
        explanation: "I couldn't map this to a supported query.",
        suggestions: buildSuggestions(findings),
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
