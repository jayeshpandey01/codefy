// src/query/synonyms.ts
var SEVERITY_SYNONYMS = {
  critical: "critical",
  crit: "critical",
  p0: "critical",
  severe: "critical",
  high: "high",
  important: "high",
  medium: "medium",
  moderate: "medium",
  low: "low",
  minor: "low",
  info: "low"
};
var STATUS_SYNONYMS = {
  confirmed: "confirmed",
  verified: "confirmed",
  "needs verification": "needs-verification",
  "needs-verification": "needs-verification",
  unverified: "needs-verification",
  unresolved: "needs-verification",
  discarded: "discarded",
  dismissed: "discarded",
  "false positive": "discarded",
  "false-positive": "discarded"
};
var SINK_CLASS_SYNONYMS = {
  "sql injection": "sql-injection",
  sqli: "sql-injection",
  "command injection": "command-injection",
  "os command injection": "command-injection",
  rce: "command-injection",
  ssrf: "ssrf",
  "server-side request forgery": "ssrf",
  "path traversal": "path-traversal",
  "directory traversal": "path-traversal",
  "code injection": "code-injection",
  eval: "code-injection",
  "prototype pollution": "prototype-pollution"
};
var BUG_WORDS = [
  "bug",
  "bugs",
  "vulnerability",
  "vulnerabilities",
  "vuln",
  "vulns",
  "issue",
  "issues",
  "finding",
  "findings",
  "problem",
  "problems"
];

// src/query/entities.ts
function normalizeQuery(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
function matchAllPhrases(normalized, dict) {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  const matched = [];
  const seen = /* @__PURE__ */ new Set();
  for (const key of keys) {
    if (normalized.includes(key)) {
      const value = dict[key];
      if (!seen.has(value)) {
        seen.add(value);
        matched.push(value);
      }
    }
  }
  return matched;
}
function extractSeverities(normalized) {
  return matchAllPhrases(normalized, SEVERITY_SYNONYMS);
}
function extractStatuses(normalized) {
  return matchAllPhrases(normalized, STATUS_SYNONYMS);
}
function extractSinkClass(normalized) {
  return matchAllPhrases(normalized, SINK_CLASS_SYNONYMS)[0];
}
var CWE_PATTERN = /cwe-?(\d+)/i;
function extractCwe(text) {
  const match = CWE_PATTERN.exec(text);
  return match ? `CWE-${match[1]}` : void 0;
}
var FINDING_ID_PATTERN = /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d[a-z0-9-]*)\b/i;
function extractFindingId(rawText) {
  const match = FINDING_ID_PATTERN.exec(rawText);
  return match ? match[1] : void 0;
}
function extractFilter(normalized, rawText) {
  const severity = extractSeverities(normalized);
  const status = extractStatuses(normalized);
  const sinkClass = extractSinkClass(normalized);
  const cwe = extractCwe(rawText);
  if (severity.length === 0 && status.length === 0 && !sinkClass && !cwe) {
    return void 0;
  }
  const filter = {};
  if (severity.length > 0) filter.severity = severity;
  if (status.length > 0) filter.status = status;
  if (sinkClass) filter.sinkClass = sinkClass;
  if (cwe) filter.cwe = cwe;
  return filter;
}

// src/query/intent.ts
var RULE_COVERAGE_PHRASES = [
  "do you check for",
  "do you scan for",
  "do you detect",
  "do you support",
  "what do you scan",
  "what do you check",
  "what do you support",
  "rule coverage",
  "coverage"
];
var SUMMARY_PHRASES = [
  "how many",
  "give me a summary",
  "scan summary",
  "summary",
  "overview"
];
var FILES_PHRASES = [
  "which files",
  "what files",
  "files with issues",
  "files have issues",
  "files have findings",
  "files with findings"
];
var GRAPH_PATH_PHRASES = [
  "show me the path",
  "show the path",
  "show path",
  "show graph",
  "trace this",
  "trace to the sink",
  "trace it"
];
var EXPLAIN_PHRASES = ["why is", "why did", "why does", "explain"];
function parseQuery(rawQuery) {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) return void 0;
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
    return build("SHOW_GRAPH_PATH", rawQuery, void 0, findingId);
  }
  if (EXPLAIN_PHRASES.some((p) => normalized.includes(p))) {
    return build("EXPLAIN_FINDING", rawQuery, void 0, findingId);
  }
  const filter = extractFilter(normalized, rawQuery);
  const hasBugWord = BUG_WORDS.some((w) => normalized.includes(w));
  if (findingId && !hasBugWord && !filter) {
    return build("FIND_FINDING_BY_ID", rawQuery, void 0, findingId);
  }
  if (hasBugWord || filter) {
    return build("LIST_FINDINGS", rawQuery, filter);
  }
  return void 0;
}
function build(intent, rawQuery, filter, findingId) {
  const ast = { intent, rawQuery };
  if (filter) ast.filter = filter;
  if (findingId) ast.findingId = findingId;
  return ast;
}

// src/rules/registry.ts
var JS_COMMAND_INJECTION_EXEC_RULE = `id: js-command-injection-exec
language: TypeScript
severity: error
message: >
  User-controlled input reaches child_process.exec/execSync with shell interpretation enabled.
  This allows arbitrary OS command execution.
note: |
  exec()/execSync() run their argument through /bin/sh (or cmd.exe), so any shell metacharacter
  in tainted input (;, |, &&, $(), backticks) breaks out of the intended command.
rule:
  any:
    - pattern: $CP.exec($CMD)
    - pattern: $CP.exec($CMD, $$$)
    - pattern: $CP.execSync($CMD)
    - pattern: $CP.execSync($CMD, $$$)
    - pattern: exec($CMD)
    - pattern: exec($CMD, $$$)
    - pattern: execSync($CMD)
    - pattern: execSync($CMD, $$$)
constraints:
  CMD:
    not:
      any:
        - kind: string
        - kind: template_string
fix: |
  $CP.execFile($BIN, [$$$ARGS], $$$)
`;
var JS_SQL_INJECTION_STRING_CONCAT_RULE = `id: js-sql-injection-string-concat
language: TypeScript
severity: error
message: >
  SQL query built via string concatenation/template literal interpolation instead of
  parameterized placeholders \u2014 classic SQL injection.
rule:
  any:
    - pattern: $DB.query($QUERY)
    - pattern: $DB.query($QUERY, $$$)
    - pattern: $KNEX.raw($QUERY)
    - pattern: $PRISMA.$queryRawUnsafe($QUERY)
  has:
    field: arguments
    stopBy: end
    any:
      - kind: template_string
        has: { kind: template_substitution, stopBy: end }
      - kind: binary_expression
        has: { pattern: "+" }
note: |
  Safe replacements: parameterized placeholders ($DB.query('...$1...', [val])),
  Prisma tagged templates ($queryRaw\`...\${val}...\`), or knex.raw('?', [val]).
`;
var JS_SSRF_UNVALIDATED_URL_RULE = `id: js-ssrf-unvalidated-url
language: TypeScript
severity: warning
message: >
  A user-controlled value reaches an outbound HTTP call (fetch/axios/http.request) with no
  visible URL-scheme/host validation on the same path \u2014 potential SSRF.
rule:
  any:
    - pattern: fetch($URL)
    - pattern: fetch($URL, $$$)
    - pattern: $AXIOS.get($URL)
    - pattern: $AXIOS.get($URL, $$$)
    - pattern: $HTTP.request($URL)
    - pattern: $HTTP.request($URL, $$$)
constraints:
  URL:
    not:
      kind: string
note: |
  This rule flags the candidate path; the deterministic sanitizer-filter logic (A.3) then checks
  the same path for a private-IP/scheme allowlist guard before promoting to a Finding \u2014 the
  ast-grep rule alone never decides confirmed/discarded.
`;
var JS_PATH_TRAVERSAL_RULE = `id: js-path-traversal
language: TypeScript
severity: error
message: >
  User-controlled input reaches filesystem read operations without path normalization and boundary validation.
note: |
  Unsanitized file paths allow attackers to escape the intended directory using ../ sequences.
rule:
  any:
    - pattern: $FS.readFile($PATH, $$$)
    - pattern: $FS.readFileSync($PATH, $$$)
    - pattern: $FS.createReadStream($PATH, $$$)
    - pattern: fs.readFile($PATH, $$$)
    - pattern: fs.readFileSync($PATH, $$$)
    - pattern: fs.createReadStream($PATH, $$$)
    - pattern: readFile($PATH, $$$)
    - pattern: readFileSync($PATH, $$$)
    - pattern: createReadStream($PATH, $$$)
constraints:
  PATH:
    not:
      any:
        - kind: string
`;
var JS_CODE_INJECTION_RULE = `id: js-code-injection
language: TypeScript
severity: error
message: >
  User-controlled input reaches eval, Function constructor, or vm execution context.
note: |
  Dynamic code evaluation allows arbitrary JavaScript execution in the server runtime.
rule:
  any:
    - pattern: eval($CODE)
    - pattern: new Function($CODE, $$$)
    - pattern: Function($CODE, $$$)
    - pattern: $VM.runInContext($CODE, $$$)
    - pattern: $VM.runInNewContext($CODE, $$$)
    - pattern: $VM.runInThisContext($CODE, $$$)
constraints:
  CODE:
    not:
      any:
        - kind: string
`;
var ALL_RULES = [
  JS_COMMAND_INJECTION_EXEC_RULE,
  JS_SQL_INJECTION_STRING_CONCAT_RULE,
  JS_SSRF_UNVALIDATED_URL_RULE,
  JS_PATH_TRAVERSAL_RULE,
  JS_CODE_INJECTION_RULE
];
var RULE_METADATA_BY_ID = {
  "js-command-injection-exec": {
    ruleId: "js-command-injection-exec",
    ruleYaml: JS_COMMAND_INJECTION_EXEC_RULE,
    code: "command_injection",
    scope: "security",
    reason: "User-controlled input reaches child_process.exec/execSync with shell interpretation enabled, allowing arbitrary OS command execution.",
    hint: "Use child_process.execFile or spawn with argument arrays instead of passing raw command strings to a shell.",
    fix: "import { execFile } from 'node:child_process';\nexecFile(binaryPath, [arg1, arg2], (err, stdout) => { ... });",
    link: "https://cwe.mitre.org/data/definitions/78.html"
  },
  "js-sql-injection-string-concat": {
    ruleId: "js-sql-injection-string-concat",
    ruleYaml: JS_SQL_INJECTION_STRING_CONCAT_RULE,
    code: "sql_injection",
    scope: "security",
    reason: "SQL query built via string concatenation or template literal interpolation allows attackers to alter query logic and extract/modify database records.",
    hint: "Use parameterized placeholders ($1, ?), Prisma tagged templates ($queryRaw), or Knex bindings.",
    fix: "await db.query('SELECT * FROM users WHERE id = $1', [userId]);",
    link: "https://cwe.mitre.org/data/definitions/89.html"
  },
  "js-ssrf-unvalidated-url": {
    ruleId: "js-ssrf-unvalidated-url",
    ruleYaml: JS_SSRF_UNVALIDATED_URL_RULE,
    code: "ssrf",
    scope: "security",
    reason: "User-controlled URL is passed to an outbound HTTP client (fetch/axios/http) without scheme/host validation, risking SSRF against internal services or cloud metadata.",
    hint: "Parse with new URL() and validate scheme (https:) and host against a strict allowlist before dispatching requests.",
    fix: "const parsed = new URL(targetUrl);\nif (!ALLOWED_DOMAINS.includes(parsed.hostname)) throw new Error('Untrusted host');\nawait fetch(parsed.toString());",
    link: "https://cwe.mitre.org/data/definitions/918.html"
  },
  "js-path-traversal": {
    ruleId: "js-path-traversal",
    ruleYaml: JS_PATH_TRAVERSAL_RULE,
    code: "path_traversal",
    scope: "security",
    reason: "User-controlled path passed directly to filesystem functions allows attackers to escape the intended directory via ../ sequences.",
    hint: "Resolve path against base directory with path.resolve and verify the result starts with the base path.",
    fix: "const safePath = path.resolve(BASE_DIR, path.normalize(userInput));\nif (!safePath.startsWith(BASE_DIR)) throw new Error('Path traversal detected');",
    link: "https://cwe.mitre.org/data/definitions/22.html"
  },
  "js-code-injection": {
    ruleId: "js-code-injection",
    ruleYaml: JS_CODE_INJECTION_RULE,
    code: "code_injection",
    scope: "security",
    reason: "Passing untrusted input to eval(), Function(), or vm.runInThisContext allows arbitrary JavaScript execution in the server runtime.",
    hint: "Avoid dynamic code evaluation. Parse structured data with JSON.parse or use an isolated AST expression evaluator.",
    fix: "const safeData = JSON.parse(userJsonString);",
    link: "https://cwe.mitre.org/data/definitions/95.html"
  }
};

// src/query/graph-view-picker.ts
var SUPPLY_CHAIN_KEYWORDS = ["depend", "package", "supply chain"];
var BLAST_RADIUS_KEYWORDS = ["affect", "impact", "blast", "downstream", "how bad"];
function pickGraphViewMode(ast, finding) {
  if (finding?.scope === "orchestrator" || finding?.id.startsWith("remote-") || finding?.ruleId.startsWith("remote-")) {
    return "remote";
  }
  if (ast.intent === "SHOW_GRAPH_PATH") {
    return "graph";
  }
  if (ast.intent === "EXPLAIN_FINDING" && finding?.trace.steps.some((step) => step.role === "sanitizer")) {
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

// src/query/executor.ts
var SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
var ORCHESTRATOR_SCAN_PROFILES = [
  { name: "recon", tool: "httpx" },
  { name: "web-discovery", tool: "httpx" },
  { name: "network-portscan", tool: "nmap" },
  { name: "fast-portscan", tool: "masscan" },
  { name: "content-discovery", tool: "ffuf" },
  { name: "vuln-assessment", tool: "nuclei" }
];
function buildSuggestions(findings) {
  const suggestions = [];
  const bySeverity = ["critical", "high", "medium", "low"].find(
    (severity) => findings.some((f) => f.severity === severity)
  );
  suggestions.push(`Show ${bySeverity ?? "critical"} findings`);
  if (findings.length > 0) {
    suggestions.push("Why is this confirmed?");
  }
  suggestions.push("Which files have issues?", "What do you scan for?");
  return suggestions;
}
function matchesFilter(finding, filter) {
  if (filter.severity && !filter.severity.includes(finding.severity)) return false;
  if (filter.status && !filter.status.includes(finding.status)) return false;
  if (filter.ruleId && finding.ruleId !== filter.ruleId) return false;
  if (filter.cwe && finding.cwe !== filter.cwe) return false;
  if (filter.sinkClass && finding.trace.sinkClass !== filter.sinkClass) return false;
  if (filter.filePathContains && !finding.trace.steps.some(
    (s) => s.filePath.toLowerCase().includes(filter.filePathContains.toLowerCase())
  )) {
    return false;
  }
  return true;
}
function filterFindings(findings, filter) {
  const matched = filter ? findings.filter((f) => matchesFilter(f, filter)) : [...findings];
  return matched.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
function resolveFinding(findings, id, rawQuery) {
  if (id) {
    const exact = findings.find((f) => f.id === id);
    if (exact) return exact;
  }
  return findings.find((f) => rawQuery.includes(f.id));
}
function executeQuery(ast, findings, options = {}) {
  switch (ast.intent) {
    case "LIST_FINDINGS": {
      const matched = filterFindings(findings, ast.filter);
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: matched,
        graphViewMode: matched.length > 0 ? pickGraphViewMode(ast, matched[0]) : void 0,
        explanation: matched.length === 0 ? "No findings matched that filter." : `${matched.length} finding(s) matched.`
      };
    }
    case "FIND_FINDING_BY_ID": {
      const found = resolveFinding(findings, ast.findingId, ast.rawQuery);
      if (!found) {
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: ast.findingId ? `No finding with id "${ast.findingId}" in the current scan.` : "No finding id was given.",
          suggestions: buildSuggestions(findings)
        };
      }
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [found],
        graphViewMode: pickGraphViewMode(ast, found)
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
          explanation: id ? `No finding with id "${id}" in the current scan.` : 'Which finding? Select one first, then ask "why is this confirmed?"',
          suggestions: buildSuggestions(findings)
        };
      }
      const graphViewMode = pickGraphViewMode(ast, found);
      if (ast.intent === "SHOW_GRAPH_PATH") {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: [found],
          graphViewMode
        };
      }
      const hasSanitizerStep = found.trace.steps.some((s) => s.role === "sanitizer");
      const explanationParts = [
        `Status: ${found.status.toUpperCase()}.`,
        `Severity: ${found.severity.toUpperCase()}.`
      ];
      if (found.reason) explanationParts.push(found.reason);
      explanationParts.push(
        hasSanitizerStep ? "A sanitizer step exists on this path but did not resolve to a known-safe pattern." : "No sanitizer step was found on this path."
      );
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [found],
        graphViewMode,
        explanation: explanationParts.join(" ")
      };
    }
    case "LIST_FILES_WITH_FINDINGS": {
      if (!options.workspaceGraph) {
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: "Workspace graph hasn't loaded yet \u2014 run a scan first."
        };
      }
      const filePaths = options.workspaceGraph.nodes.filter((n) => n.type === "file" && (n.findingCount ?? 0) > 0).map((n) => n.filePath);
      const matched = findings.filter(
        (f) => f.trace.steps.some((s) => filePaths.includes(s.filePath))
      );
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: matched,
        explanation: filePaths.length === 0 ? "No files with findings." : `${filePaths.length} file(s) have findings: ${filePaths.join(", ")}`
      };
    }
    case "FIND_RULE_COVERAGE": {
      const rules = Object.values(RULE_METADATA_BY_ID);
      const lines = rules.map((r) => {
        const cwe = /cwe\/definitions\/(\d+)/i.exec(r.link)?.[1];
        return `\u2713 ${r.code}${cwe ? ` (CWE-${cwe})` : ""}`;
      });
      const orchestratorFindingCount = findings.filter(
        (f) => f.scope === "orchestrator" || f.id.startsWith("remote-")
      ).length;
      const explanation = [
        `Local static analysis (JavaScript/TypeScript only, ${ALL_RULES.length} rule(s)):`,
        ...lines,
        "",
        "Remote authorized scanning (via the orchestrator, opt-in \u2014 requires a registered, authorized target):",
        ...ORCHESTRATOR_SCAN_PROFILES.map((p) => `\u2713 ${p.name} (${p.tool})`),
        orchestratorFindingCount > 0 ? `${orchestratorFindingCount} orchestrator finding(s) already in this scan.` : "No orchestrator scan has been run in this session yet.",
        "",
        "Not yet implemented: Python/Go local rules (documented, not built \u2014 see docs/DETECTION-ENGINE-SPEC.md \xA7A.1), dependency/CVE scanning, GitHub Actions analysis."
      ].join("\n");
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [],
        explanation
      };
    }
    case "SCAN_SUMMARY": {
      const confirmed = findings.filter((f) => f.status === "confirmed");
      const needsVerification = findings.filter((f) => f.status === "needs-verification");
      const discarded = findings.filter((f) => f.status === "discarded");
      const explanation = confirmed.length === 0 ? `No confirmed findings under the ${ALL_RULES.length} currently-enabled rule(s). Needs-verification: ${needsVerification.length}. Discarded: ${discarded.length}.` : `${confirmed.length} confirmed, ${needsVerification.length} needs-verification, ${discarded.length} discarded \u2014 ${findings.length} total findings under the ${ALL_RULES.length} currently-enabled rule(s).`;
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: confirmed,
        explanation
      };
    }
  }
}
function runChatQuery(rawQuery, findings, options = {}) {
  const ast = parseQuery(rawQuery);
  if (!ast) {
    return {
      capability: "UNSUPPORTED",
      findings: [],
      explanation: "I couldn't map this to a supported query.",
      suggestions: buildSuggestions(findings)
    };
  }
  return executeQuery(ast, findings, options);
}
export {
  executeQuery,
  parseQuery,
  pickGraphViewMode,
  runChatQuery
};
//# sourceMappingURL=index.js.map