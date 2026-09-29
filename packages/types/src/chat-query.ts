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
  | "EXPLAIN_VULNERABILITY"
  | "SHOW_GRAPH_PATH"
  | "LIST_FILES_WITH_FINDINGS"
  | "FIND_RULE_COVERAGE"
  | "SCAN_SUMMARY"
  | "ARCHITECTURE_OVERVIEW"
  | "CODE_NAVIGATION"
  | "GENERAL_ASSISTANCE"
  | "BLAST_RADIUS_ANALYSIS"
  | "TAINT_FLOW_TRACE"
  | "REMEDIATE_DIFF"
  | "VERIFY_HALLUCINATION";

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
  readonly targetFilePath?: string;
  readonly anaphorResolved?: boolean;
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

export interface RagCitation {
  readonly citationIndex: number;
  readonly section: string;
  readonly score?: number;
  readonly filePath?: string;
  readonly line?: number;
  readonly findingId?: string;
}

export interface ChatResult {
  readonly capability: QueryCapability;
  readonly intent?: QueryIntent;
  readonly findings: readonly Finding[];
  readonly graphViewMode?: ChatGraphViewMode;
  readonly explanation?: string;
  readonly targetFilePath?: string;
  /** Citations returned by RAG / TrainIQ */
  readonly citations?: readonly RagCitation[];
  /** Shown on UNSUPPORTED/PARTIALLY_SUPPORTED — example phrasings the user could try instead. */
  readonly suggestions?: readonly string[];
}

export interface StreamingChatChunk {
  readonly delta: string;
  readonly done: boolean;
  readonly citations?: readonly RagCitation[];
  readonly referencedFindingIds?: readonly string[];
  readonly graphViewMode?: ChatGraphViewMode;
  readonly suggestions?: readonly string[];
}

/**
 * Canonical slash-command registry for the chat panel — the single source
 * both `ChatPanel`'s "/" autocomplete dropdown (packages/ui) and the
 * dispatcher that actually executes a command (packages/core/src/query/slash-commands.ts)
 * read from, so the two can never drift out of sync (CLAUDE.md's
 * contract-first rule: never duplicate a data contract across packages).
 *
 * Scope is deliberately limited to what's real:
 * - `/help` is answerable locally today (lists this exact table, grouped by category).
 * - `/vuln`, `/scan`, `/axiom` mirror Hackerbot's own documented in-chat
 *   security-session commands (see docs/CHAT-QUERY-ENGINE-SPEC.md Part C.4)
 *   — not invented here. `/vuln <url> [profile]` takes any of the 24
 *   `profile` values below as its second argument, per Hackerbot's actual
 *   API (its own docs show `/vuln https://example.com vuln-assessment`).
 * - The 24 per-tool aliases (`/sast-joern`, `/xss-scan`, `/recon`, ...) are
 *   NOT part of Hackerbot's API — they're client-side sugar we invented so
 *   every tool is individually discoverable/typeable, each one equivalent
 *   to `/vuln <url> <profile>` with that alias's `profile` preset. Every
 *   alias's `name` is deliberately identical to its `profile` string
 *   (prefixed with "/") so the mapping is mechanical, not hand-maintained —
 *   see `packages/types/src/orchestrator.ts`'s `ScanProfile`/`SastProfile`
 *   unions for where these 24 values come from (verified against the live
 *   orchestrator's `GET /v1/sast/profiles` and Hackerbot's own
 *   `API_ENDPOINTS.md`, not invented).
 * - `requiresHackerbot: true` means the command is real and researched,
 *   but not yet wired up (no HackerbotClient exists yet) — submitting it
 *   must say so honestly, never silently misroute into the generic
 *   NLU/finding-lookup pipeline the way it did before this registry existed.
 */
export interface SlashCommandSpec {
  /** Including the leading "/", lowercase, e.g. "/vuln". */
  readonly name: string;
  /** Argument placeholder shown in the autocomplete list and as the input's
   * usage hint once the command name is typed, e.g. "<url> [profile]".
   * Empty string for commands that take no arguments. */
  readonly argsHint: string;
  readonly description: string;
  /** True for commands that map to Hackerbot's security-session API, which
   * isn't connected yet — see the module docstring above. */
  readonly requiresHackerbot: boolean;
  /** Grouping for /help's output and for the autocomplete list. */
  readonly category: "general" | "sast" | "dast";
  /** For per-tool aliases only: the exact orchestrator profile string this
   * alias presets as `/vuln <url> <profile>`'s second argument — always
   * equal to `name` with the leading "/" stripped. Undefined for /help,
   * /vuln itself (profile is user-supplied), /scan, and /axiom (neither
   * takes a profile). */
  readonly profile?: string;
}

const SAST_TOOL_COMMANDS: readonly SlashCommandSpec[] = [
  { name: "/sast-joern", argsHint: "<url>", description: "Code Property Graph inter-procedural taint analysis (Joern)", requiresHackerbot: true, category: "sast", profile: "sast-joern" },
  { name: "/sast-semgrep", argsHint: "<url>", description: "Semantic AST pattern matching across OWASP Top 10 & CWE rules (Semgrep)", requiresHackerbot: true, category: "sast", profile: "sast-semgrep" },
  { name: "/sast-codeql", argsHint: "<url>", description: "Deep semantic code analysis & inter-procedural taint-tracking (CodeQL)", requiresHackerbot: true, category: "sast", profile: "sast-codeql" },
  { name: "/sast-trufflehog", argsHint: "<url>", description: "High-entropy secrets & credential leak scanning (TruffleHog)", requiresHackerbot: true, category: "sast", profile: "sast-trufflehog" },
  { name: "/sast-gitleaks", argsHint: "<url>", description: "Git repository & filesystem secret scanning (Gitleaks)", requiresHackerbot: true, category: "sast", profile: "sast-gitleaks" },
  { name: "/sast-bandit", argsHint: "<url>", description: "AST-based static analysis for Python security issues (Bandit)", requiresHackerbot: true, category: "sast", profile: "sast-bandit" },
];

const DAST_TOOL_COMMANDS: readonly SlashCommandSpec[] = [
  { name: "/recon", argsHint: "<url>", description: "Fast HTTP service, security headers & title discovery (httpx)", requiresHackerbot: true, category: "dast", profile: "recon" },
  { name: "/web-discovery", argsHint: "<url>", description: "Comprehensive HTTP/HTTPS port, tech & service discovery (katana+httpx)", requiresHackerbot: true, category: "dast", profile: "web-discovery" },
  { name: "/network-portscan", argsHint: "<url>", description: "Detailed TCP service & version detection (nmap)", requiresHackerbot: true, category: "dast", profile: "network-portscan" },
  { name: "/fast-portscan", argsHint: "<url>", description: "High-speed port availability scan (masscan)", requiresHackerbot: true, category: "dast", profile: "fast-portscan" },
  { name: "/smart-portscan", argsHint: "<url>", description: "Fast reliable TCP port discovery (naabu)", requiresHackerbot: true, category: "dast", profile: "smart-portscan" },
  { name: "/content-discovery", argsHint: "<url>", description: "Web directory, route & file fuzzing (ffuf)", requiresHackerbot: true, category: "dast", profile: "content-discovery" },
  { name: "/deep-content-discovery", argsHint: "<url>", description: "Recursive high-speed content discovery (feroxbuster)", requiresHackerbot: true, category: "dast", profile: "deep-content-discovery" },
  { name: "/web-crawl", argsHint: "<url>", description: "Dynamic JS-aware spider & endpoint extraction (katana)", requiresHackerbot: true, category: "dast", profile: "web-crawl" },
  { name: "/vuln-assessment", argsHint: "<url>", description: "Template-based vulnerability assessment (nuclei)", requiresHackerbot: true, category: "dast", profile: "vuln-assessment" },
  { name: "/xss-scan", argsHint: "<url>", description: "Cross-Site Scripting: DOM, reflected & stored (dalfox)", requiresHackerbot: true, category: "dast", profile: "xss-scan" },
  { name: "/dast-zap", argsHint: "<url>", description: "Automated web application vulnerability scan (OWASP ZAP)", requiresHackerbot: true, category: "dast", profile: "dast-zap" },
  { name: "/oob-interaction", argsHint: "<url>", description: "Out-of-band interaction & blind SSRF verification (interactsh)", requiresHackerbot: true, category: "dast", profile: "oob-interaction" },
  { name: "/dns-recon", argsHint: "<url>", description: "DNS record resolution: A, CNAME, MX, TXT (dnsx)", requiresHackerbot: true, category: "dast", profile: "dns-recon" },
  { name: "/subdomain-takeover", argsHint: "<url>", description: "Subdomain takeover detection via dangling CNAMEs (subzy)", requiresHackerbot: true, category: "dast", profile: "subdomain-takeover" },
  { name: "/waf-detect", argsHint: "<url>", description: "WAF & CDN vendor fingerprinting (wafw00f)", requiresHackerbot: true, category: "dast", profile: "waf-detect" },
  { name: "/cors-audit", argsHint: "<url>", description: "CORS misconfiguration & credential theft testing (corsy)", requiresHackerbot: true, category: "dast", profile: "cors-audit" },
  { name: "/crlf-scan", argsHint: "<url>", description: "CRLF injection & HTTP response splitting detection (crlfuzz)", requiresHackerbot: true, category: "dast", profile: "crlf-scan" },
  { name: "/ssti-scan", argsHint: "<url>", description: "Server-Side Template Injection discovery (sstimap)", requiresHackerbot: true, category: "dast", profile: "ssti-scan" },
];

export const SLASH_COMMANDS: readonly SlashCommandSpec[] = [
  {
    name: "/help",
    argsHint: "",
    description: "List available commands and what this assistant can answer",
    requiresHackerbot: false,
    category: "general",
  },
  {
    name: "/vuln",
    argsHint: "<url> [profile]",
    description: "Run a cloud vulnerability scan on an authorized target — profile is any /sast-*/DAST tool name below, without its leading slash",
    requiresHackerbot: true,
    category: "general",
  },
  {
    name: "/scan",
    argsHint: "<url>",
    description: "Run an autonomous web app scan on an authorized target",
    requiresHackerbot: true,
    category: "general",
  },
  {
    name: "/axiom",
    argsHint: "<query>",
    description: "Ask the Axiom tool-calling gateway to investigate a target",
    requiresHackerbot: true,
    category: "general",
  },
  ...SAST_TOOL_COMMANDS,
  ...DAST_TOOL_COMMANDS,
];
