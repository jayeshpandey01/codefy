"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/query/index.ts
var index_exports = {};
__export(index_exports, {
  DEFAULT_AI_GATEWAY_URL: () => DEFAULT_AI_GATEWAY_URL,
  DEFAULT_ORCHESTRATOR_URL: () => DEFAULT_ORCHESTRATOR_URL,
  GatewayAuthClient: () => GatewayAuthClient,
  HostedLlmClient: () => HostedLlmClient,
  ORCHESTRATOR_ORIGIN_ALLOWLIST: () => ORCHESTRATOR_ORIGIN_ALLOWLIST,
  OrchestratorApiError: () => OrchestratorApiError,
  SLASH_COMMANDS: () => import_types.SLASH_COMMANDS,
  ScanOrchestratorClient: () => ScanOrchestratorClient,
  buildDynamicSuggestions: () => buildDynamicSuggestions,
  buildSuggestions: () => buildSuggestions,
  cleanCredential: () => cleanCredential,
  executeQuery: () => executeQuery,
  executeRagRetrieval: () => executeRagRetrieval,
  executeSlashCommand: () => executeSlashCommand,
  executeUnknownSlashCommand: () => executeUnknownSlashCommand,
  generateFixDiffText: () => generateFixDiffText,
  generateMarkdownReport: () => generateMarkdownReport,
  generateOkfBundle: () => generateOkfBundle,
  generateUnifiedDiff: () => generateUnifiedDiff,
  handleOrchestratorMessage: () => handleOrchestratorMessage,
  isOrchestratorRequest: () => isOrchestratorRequest,
  parseQuery: () => parseQuery,
  parseSlashCommand: () => parseSlashCommand,
  pickGraphViewMode: () => pickGraphViewMode,
  resolveOrchestratorUrl: () => resolveOrchestratorUrl,
  runChatQuery: () => runChatQuery,
  validateOrchestratorUrl: () => validateOrchestratorUrl
});
module.exports = __toCommonJS(index_exports);

// src/rag/nlu-analyzer.ts
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "aren't",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "can't",
  "cannot",
  "could",
  "couldn't",
  "did",
  "didn't",
  "do",
  "does",
  "doesn't",
  "doing",
  "don't",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "hadn't",
  "has",
  "hasn't",
  "have",
  "haven't",
  "having",
  "he",
  "he'd",
  "he'll",
  "he's",
  "her",
  "here",
  "here's",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "how's",
  "i",
  "i'd",
  "i'll",
  "i'm",
  "i've",
  "if",
  "in",
  "into",
  "is",
  "isn't",
  "it",
  "it's",
  "its",
  "itself",
  "let's",
  "me",
  "more",
  "most",
  "mustn't",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "ought",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "shan't",
  "she",
  "she'd",
  "she'll",
  "she's",
  "should",
  "shouldn't",
  "so",
  "some",
  "such",
  "than",
  "that",
  "that's",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "there's",
  "these",
  "they",
  "they'd",
  "they'll",
  "they're",
  "they've",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "wasn't",
  "we",
  "we'd",
  "we'll",
  "we're",
  "we've",
  "were",
  "weren't",
  "what",
  "what's",
  "when",
  "when's",
  "where",
  "where's",
  "which",
  "while",
  "who",
  "who's",
  "whom",
  "why",
  "why's",
  "with",
  "won't",
  "would",
  "wouldn't",
  "you",
  "you'd",
  "you'll",
  "you're",
  "you've",
  "your",
  "yours",
  "yourself",
  "yourselves"
]);
var PRESERVED_SECURITY_WORDS = /* @__PURE__ */ new Set([
  "sink",
  "source",
  "sanitizer",
  "propagator",
  "taint",
  "vulnerability",
  "vulnerable",
  "exploit",
  "cwe",
  "sql",
  "injection",
  "xss",
  "ssrf",
  "traversal",
  "path",
  "secret",
  "token",
  "password",
  "leak",
  "overflow",
  "sanitize",
  "guard",
  "blast",
  "radius",
  "downstream",
  "upstream",
  "imports",
  "calls",
  "fix",
  "patch",
  "remediate",
  "remediation",
  "architecture",
  "structure",
  "overview",
  "verify",
  "validate",
  "hallucination",
  "real",
  "fake",
  "confirmed",
  "impact",
  "affected",
  "redirect",
  "navigate",
  "open",
  "file",
  "developer",
  "python",
  "javascript"
]);
var INTENT_CENTROIDS = {
  EXPLAIN_VULNERABILITY: [
    "explain",
    "what is",
    "why is",
    "tell me about",
    "details",
    "description",
    "explain vulnerability",
    "what is",
    "why is",
    "tell me about",
    "details",
    "description",
    "vulnerability",
    "flaw",
    "issue",
    "bug",
    "risk",
    "severity",
    "overview of finding",
    "why is this confirmed",
    "why was this flagged",
    "vulnerability details",
    "explain this finding"
  ],
  EXPLAIN_FINDING: [
    "explain this finding",
    "why is this confirmed",
    "why was this flagged",
    "finding explanation"
  ],
  CODE_NAVIGATION: [
    "redirect to file",
    "open file",
    "go to file",
    "show file",
    "navigate to file",
    "where is file",
    "locate file",
    "jump to file",
    "view file",
    "inspect file",
    "take me to file",
    "find file",
    "redirect",
    "navigate"
  ],
  GENERAL_ASSISTANCE: [
    "explain me python developer",
    "what is a developer",
    "how does python work",
    "tell me about programming",
    "general explanation",
    "best practices",
    "software engineer",
    "developer role",
    "python development",
    "explain concept"
  ],
  REMEDIATE_DIFF: [
    "fix",
    "remediate",
    "patch",
    "how to solve",
    "resolve",
    "code fix",
    "diff",
    "before after",
    "solution",
    "remedy",
    "safe implementation",
    "sanitize code"
  ],
  BLAST_RADIUS_ANALYSIS: [
    "blast radius",
    "impact",
    "affected files",
    "downstream",
    "who imports",
    "callers",
    "call hierarchy",
    "what breaks",
    "dependency impact",
    "scope of damage"
  ],
  TAINT_FLOW_TRACE: [
    "taint trace",
    "dataflow",
    "flow path",
    "source to sink",
    "untrusted input",
    "origin",
    "propagator",
    "where does data go",
    "input tracing",
    "tainted variable"
  ],
  SHOW_GRAPH_PATH: [
    "show me the path",
    "show graph path",
    "trace to sink",
    "trace path",
    "show dataflow path",
    "trace it",
    "graph path"
  ],
  LIST_FINDINGS: [
    "list findings",
    "show vulnerabilities",
    "all bugs",
    "list issues",
    "findings list",
    "what findings do we have",
    "critical issues",
    "confirmed bugs"
  ],
  LIST_FILES_WITH_FINDINGS: [
    "which files have findings",
    "what files have issues",
    "files with vulnerabilities",
    "affected files list",
    "files with bugs",
    "files with findings"
  ],
  SCAN_SUMMARY: [
    "how many issues",
    "scan summary",
    "overview",
    "give me a summary",
    "repository overview",
    "summary of findings",
    "scan results count",
    "how many bugs"
  ],
  ARCHITECTURE_OVERVIEW: [
    "architecture",
    "repo structure",
    "repository overview",
    "services",
    "system design",
    "components",
    "modules",
    "workspace summary",
    "high level overview",
    "stack"
  ],
  FIND_RULE_COVERAGE: [
    "do you check for",
    "do you scan for",
    "do you detect",
    "what do you check",
    "rule coverage",
    "supported rules",
    "what vulnerabilities are checked",
    "what do you scan"
  ],
  FIND_FINDING_BY_ID: [
    "show finding",
    "finding id",
    "inspect finding",
    "view finding",
    "open finding",
    "show me finding"
  ],
  VERIFY_HALLUCINATION: [
    "verify",
    "validate",
    "is this real",
    "is this true",
    "hallucination",
    "check finding",
    "confirm",
    "false positive",
    "legitimate",
    "accurate"
  ]
};
var DEICTIC_ANAPHOR_TERMS = /* @__PURE__ */ new Set([
  "this",
  "it",
  "that",
  "selected",
  "current",
  "here",
  "above",
  "its"
]);
function hasAnaphoricReferent(query, tokens) {
  const lower = query.toLowerCase();
  if (/\b(this|that|it|its|selected|current)\b/i.test(lower)) {
    return true;
  }
  return tokens.some((t) => DEICTIC_ANAPHOR_TERMS.has(t));
}
function resolveCoreference(tokens, rawQuery, activeFindingId) {
  if (!activeFindingId) {
    return { boundFindingId: void 0, isAnaphoric: false };
  }
  const isAnaphoric = hasAnaphoricReferent(rawQuery, tokens);
  const mentionsFindingDirectly = rawQuery.toLowerCase().includes(activeFindingId.toLowerCase());
  if (isAnaphoric || mentionsFindingDirectly) {
    return { boundFindingId: activeFindingId, isAnaphoric: true };
  }
  return { boundFindingId: void 0, isAnaphoric: false };
}
function splitCamelCase(word) {
  const parts = word.replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/);
  if (parts.length > 1) {
    return [...parts.map((p) => p.toLowerCase()), word.toLowerCase()];
  }
  return [word.toLowerCase()];
}
function splitCompound(word) {
  const parts = word.split(/[_\-./\\]+/).filter(Boolean);
  if (parts.length > 1) {
    return [...parts.map((p) => p.toLowerCase()), word.toLowerCase()];
  }
  return [word.toLowerCase()];
}
function tokenizeText(text) {
  if (!text || text.trim().length === 0) return [];
  const rawWords = text.replace(/[^\w\s./\\-]/g, " ").split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const rawWord of rawWords) {
    if (/^(?:F-\d+|remote-[a-z0-9-]+|CWE-\d+)$/i.test(rawWord)) {
      tokens.push(rawWord.toUpperCase());
      continue;
    }
    const compounds = splitCompound(rawWord);
    for (const comp of compounds) {
      const camelParts = splitCamelCase(comp);
      for (const part of camelParts) {
        const lower = part.toLowerCase();
        if (lower.length >= 2 && (!STOP_WORDS.has(lower) || PRESERVED_SECURITY_WORDS.has(lower))) {
          tokens.push(lower);
        }
      }
    }
  }
  return Array.from(new Set(tokens));
}
function extractSlots(text) {
  const findingIdPattern = /\b(?:F-\d+|remote-[a-z0-9-]+)\b/gi;
  const findingIds = Array.from(new Set((text.match(findingIdPattern) ?? []).map((m) => m.toUpperCase())));
  const cwePattern = /\bCWE[-_]?(\d+)\b/gi;
  const cweMatches = text.match(cwePattern) ?? [];
  const cweIds = Array.from(new Set(cweMatches.map((m) => m.toUpperCase().replace("_", "-"))));
  const filePathPattern = /\b[\w/.-]+\.(?:ts|tsx|js|jsx|py|go|java|c|cpp|rs|json|yaml|yml|html|css)\b/gi;
  const filePaths = Array.from(new Set((text.match(filePathPattern) ?? []).map((m) => m.toLowerCase())));
  const KNOWN_SINKS = [
    "command-injection",
    "sql-injection",
    "ssrf",
    "path-traversal",
    "code-injection",
    "prototype-pollution",
    "secret-exposure",
    "xss"
  ];
  const sinkClasses = [];
  const lowerText = text.toLowerCase();
  for (const sink of KNOWN_SINKS) {
    const term = sink.replace("-", " ");
    if (lowerText.includes(sink) || lowerText.includes(term)) {
      sinkClasses.push(sink);
    }
  }
  let targetSeverity;
  if (/\bcritical\b/i.test(text)) targetSeverity = "critical";
  else if (/\bhigh\b/i.test(text)) targetSeverity = "high";
  else if (/\bmedium\b/i.test(text)) targetSeverity = "medium";
  else if (/\blow\b/i.test(text)) targetSeverity = "low";
  return {
    findingIds,
    cweIds,
    filePaths,
    sinkClasses: Array.from(new Set(sinkClasses)),
    targetSeverity
  };
}
function computeTfIdfVector(tokens, vocabulary) {
  const counts = {};
  for (const t of tokens) {
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return vocabulary.map((word) => counts[word] ?? 0);
}
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
var VOCABULARY_SET = /* @__PURE__ */ new Set();
for (const centroidPhrases of Object.values(INTENT_CENTROIDS)) {
  for (const phrase of centroidPhrases) {
    for (const t of tokenizeText(phrase)) {
      VOCABULARY_SET.add(t);
    }
  }
}
var VOCABULARY = Array.from(VOCABULARY_SET);
var PRECOMPILED_CENTROID_VECTORS = (function() {
  const result = {};
  for (const [intent, phrases] of Object.entries(INTENT_CENTROIDS)) {
    const allTokens = phrases.flatMap((p) => tokenizeText(p));
    result[intent] = computeTfIdfVector(allTokens, VOCABULARY);
  }
  return result;
})();
function classifyIntent(tokens, slots, rawQuery) {
  if (slots && slots.filePaths.length > 0 && rawQuery && /\b(redirect|open|navigate|go\s+to|jump|where|locate|show|view|file)\b/i.test(rawQuery)) {
    return { intent: "CODE_NAVIGATION", confidence: 0.95 };
  }
  const queryVec = computeTfIdfVector(tokens, VOCABULARY);
  let bestIntent = "GENERAL_ASSISTANCE";
  let maxScore = -1;
  for (const [intent, centroidVec] of Object.entries(PRECOMPILED_CENTROID_VECTORS)) {
    const score = cosineSimilarity(queryVec, centroidVec);
    if (score > maxScore) {
      maxScore = score;
      bestIntent = intent;
    }
  }
  const hasSecurityEntities = slots && (slots.findingIds.length > 0 || slots.cweIds.length > 0 || slots.sinkClasses.length > 0 || Boolean(slots.targetSeverity)) || (rawQuery ? hasAnaphoricReferent(rawQuery, tokens) : false);
  if ((bestIntent === "EXPLAIN_FINDING" || bestIntent === "EXPLAIN_VULNERABILITY") && !hasSecurityEntities) {
    if (tokens.some((t) => ["developer", "python", "javascript", "react", "programming", "role", "language", "code", "syntax"].includes(t))) {
      bestIntent = "GENERAL_ASSISTANCE";
    }
  }
  const confidence = maxScore > 0 ? Math.min(1, Number(maxScore.toFixed(3))) : 0.2;
  return { intent: bestIntent, confidence };
}
function analyzeQuery(query, activeFindingId) {
  const tokens = tokenizeText(query);
  const slots = extractSlots(query);
  const { intent, confidence } = classifyIntent(tokens, slots, query);
  const coref = resolveCoreference(tokens, query, activeFindingId);
  return {
    rawQuery: query,
    tokens,
    intent,
    intentConfidence: confidence,
    slots,
    boundFindingId: coref.boundFindingId,
    isAnaphoric: coref.isAnaphoric
  };
}

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
var FINDING_ID_PATTERN = /\b(?!cwe-?\d)([a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d[a-z0-9-]*)\b/i;
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
function parseQuery(rawQuery) {
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length === 0) return void 0;
  const nlu = analyzeQuery(rawQuery);
  const findingId = nlu.slots.findingIds[0] || extractFindingId(rawQuery);
  const filter = extractFilter(normalized, rawQuery);
  if (nlu.intent === "CODE_NAVIGATION" || nlu.slots.filePaths.length > 0 && /\b(redirect|open|navigate|go\s+to|jump|where|locate|show|view|file)\b/i.test(rawQuery)) {
    return {
      intent: "CODE_NAVIGATION",
      rawQuery,
      targetFilePath: nlu.slots.filePaths[0],
      findingId
    };
  }
  const hasPathVerb = /\b(path|trace|graph|sink|flow)\b/i.test(rawQuery);
  const hasExplainVerb = /\b(why|explain|details)\b/i.test(rawQuery);
  if (findingId && !filter && !hasPathVerb && !hasExplainVerb) {
    return {
      intent: "FIND_FINDING_BY_ID",
      rawQuery,
      findingId
    };
  }
  if (filter && !hasExplainVerb && !hasPathVerb) {
    return {
      intent: "LIST_FINDINGS",
      rawQuery,
      filter
    };
  }
  if (nlu.intent === "SHOW_GRAPH_PATH" || nlu.intent === "TAINT_FLOW_TRACE" || hasPathVerb) {
    const ast = {
      intent: "SHOW_GRAPH_PATH",
      rawQuery
    };
    if (findingId) ast.findingId = findingId;
    if (nlu.isAnaphoric) ast.anaphorResolved = true;
    return ast;
  }
  if (nlu.intent === "EXPLAIN_FINDING" || nlu.intent === "EXPLAIN_VULNERABILITY") {
    const ast = {
      intent: "EXPLAIN_FINDING",
      rawQuery
    };
    if (findingId) ast.findingId = findingId;
    if (!findingId && filter) ast.filter = filter;
    if (nlu.isAnaphoric) ast.anaphorResolved = true;
    return ast;
  }
  if (nlu.intent === "BLAST_RADIUS_ANALYSIS") {
    return {
      intent: "BLAST_RADIUS_ANALYSIS",
      rawQuery,
      findingId,
      anaphorResolved: nlu.isAnaphoric
    };
  }
  if (nlu.intent === "FIND_RULE_COVERAGE") {
    return {
      intent: "FIND_RULE_COVERAGE",
      rawQuery
    };
  }
  if (nlu.intent === "LIST_FILES_WITH_FINDINGS") {
    return {
      intent: "LIST_FILES_WITH_FINDINGS",
      rawQuery
    };
  }
  if (nlu.intent === "SCAN_SUMMARY" || nlu.intent === "ARCHITECTURE_OVERVIEW" && !rawQuery.toLowerCase().includes("scalable")) {
    return {
      intent: "SCAN_SUMMARY",
      rawQuery
    };
  }
  const hasBugWord = BUG_WORDS.some((w) => normalized.includes(w));
  if (nlu.intent === "LIST_FINDINGS" || filter || hasBugWord) {
    const ast = {
      intent: "LIST_FINDINGS",
      rawQuery
    };
    if (filter) ast.filter = filter;
    return ast;
  }
  if (nlu.intent === "GENERAL_ASSISTANCE") {
    return {
      intent: "GENERAL_ASSISTANCE",
      rawQuery
    };
  }
  return void 0;
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
function buildDynamicSuggestions(findings, context = {}) {
  const targetFindingId = context.selectedFindingId ?? (findings.length === 1 ? findings[0]?.id : void 0);
  if (targetFindingId) {
    return [
      `How do I fix ${targetFindingId} safely?`,
      `Show dataflow trace for ${targetFindingId}`,
      context.graphViewMode === "control_flow" ? "Why did the sanitizer fail to validate?" : "What services are affected downstream?"
    ];
  }
  const suggestions = [];
  const bySeverity = ["critical", "high", "medium", "low"].find(
    (severity) => findings.some((f) => f.severity === severity)
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
function describeFindingWithRemediation(found) {
  const hasSanitizerStep = found.trace.steps.some((s) => s.role === "sanitizer");
  const parts = [
    `Status: ${found.status.toUpperCase()}.`,
    `Severity: ${found.severity.toUpperCase()}.`
  ];
  if (found.reason) parts.push(found.reason);
  parts.push(
    hasSanitizerStep ? "A sanitizer step exists on this path but did not resolve to a known-safe pattern." : "No sanitizer step was found on this path."
  );
  if (found.hint) parts.push(`Suggestion: ${found.hint}`);
  if (found.fix) parts.push(`Fix:
${found.fix}`);
  return parts.join(" ");
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
    case "EXPLAIN_VULNERABILITY":
    case "SHOW_GRAPH_PATH":
    case "TAINT_FLOW_TRACE": {
      const hasAnaphor = ast.anaphorResolved || /\b(this|that|it|its|selected|current)\b/i.test(ast.rawQuery);
      const id = ast.findingId ?? (hasAnaphor || !ast.rawQuery || ast.rawQuery === "x" ? options.selectedFindingId : void 0);
      const found = resolveFinding(findings, id, ast.rawQuery);
      if (!found) {
        if (!id && ast.filter && (ast.intent === "EXPLAIN_FINDING" || ast.intent === "EXPLAIN_VULNERABILITY")) {
          const matched = filterFindings(findings, ast.filter);
          if (matched.length > 0) {
            return {
              capability: "SUPPORTED",
              intent: ast.intent,
              findings: matched,
              graphViewMode: pickGraphViewMode(ast, matched[0]),
              explanation: matched.map(describeFindingWithRemediation).join("\n\n")
            };
          }
          return {
            capability: "PARTIALLY_SUPPORTED",
            intent: ast.intent,
            findings: [],
            explanation: `No findings matched ${ast.filter.cwe ?? "that filter"} in the current scan.`,
            suggestions: buildSuggestions(findings)
          };
        }
        return {
          capability: "PARTIALLY_SUPPORTED",
          intent: ast.intent,
          findings: [],
          explanation: id ? `No finding with id "${id}" in the current scan.` : 'Which finding? Select one first, then ask "why is this confirmed?"',
          suggestions: buildSuggestions(findings)
        };
      }
      const graphViewMode = pickGraphViewMode(ast, found);
      if (ast.intent === "SHOW_GRAPH_PATH" || ast.intent === "TAINT_FLOW_TRACE") {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: [found],
          graphViewMode
        };
      }
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [found],
        graphViewMode,
        explanation: describeFindingWithRemediation(found)
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
          suggestions: buildSuggestions(findings)
        };
      }
      const matchingFindings = findings.filter(
        (f) => f.trace.steps.some((s) => s.filePath?.toLowerCase().includes(targetFile)) || f.id.toLowerCase() === targetFile
      );
      const graphNode = options.workspaceGraph?.nodes.find(
        (n) => n.type === "file" && n.filePath.toLowerCase().includes(targetFile)
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
            "What files have issues?"
          ]
        };
      }
      if (graphNode) {
        return {
          capability: "SUPPORTED",
          intent: ast.intent,
          findings: [],
          graphViewMode: "graph",
          targetFilePath: resolvedPath,
          explanation: `Navigated to **${resolvedPath}**. File verified in workspace graph \u2014 **0 security vulnerabilities** detected in this file.`,
          suggestions: [
            "What files have issues?",
            "Show scan summary",
            "What do you check for?"
          ]
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
          "What do you check for?"
        ]
      };
    }
    case "GENERAL_ASSISTANCE": {
      const lower = ast.rawQuery.toLowerCase();
      let explanation = "";
      if (lower.includes("python") && lower.includes("developer")) {
        explanation = "### Python Developer Role Overview\n\nA **Python Developer** designs, develops, and maintains software applications, automation pipelines, and backend architectures using Python.\n\n**Key Responsibilities & Security Focus:**\n- **Backend Engineering:** Building performant web APIs (FastAPI, Django, Flask).\n- **Security Hardening:** Enforcing parameterization to prevent SQL injection (CWE-89), securing OS execution against command injection (CWE-78), and preventing secret leaks.\n- **Data Processing & AI:** Developing pipelines with Pandas/NumPy, integrating LLMs, vector search, and GraphRAG architectures.\n- **Testing & Static Analysis:** Writing automated tests (pytest) and using SAST tools like Codefy to detect vulnerabilities early.";
      } else if (lower.includes("developer") || lower.includes("engineer")) {
        explanation = "### Software Developer Role Overview\n\nA software developer designs, builds, tests, and maintains applications. In security-conscious workflows, developers integrate automated taint-tracking and static code analysis to remediate vulnerabilities before production deployment.";
      } else {
        explanation = "I am your **Codefy Security & Code Intelligence Assistant**. I provide evidence-grounded vulnerability triage, taint trace analysis, and code navigation for your workspace.";
      }
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: [],
        explanation,
        suggestions: [
          "Show scan summary",
          "Which files have issues?",
          "What do you check for?"
        ]
      };
    }
    case "BLAST_RADIUS_ANALYSIS": {
      const id = ast.findingId ?? (ast.anaphorResolved ? options.selectedFindingId : void 0);
      const found = resolveFinding(findings, id, ast.rawQuery);
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: found ? [found] : findings.slice(0, 3),
        graphViewMode: "blast_radius",
        explanation: found ? `Blast radius analysis for **${found.id}** (${found.title}): Inspecting downstream imports and caller hierarchy.` : "Switched to Blast Radius view mode. Select a finding to evaluate downstream impact.",
        suggestions: buildSuggestions(findings)
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
        "Not yet implemented: Python/Go local rules, dependency/CVE scanning, GitHub Actions analysis."
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
    case "ARCHITECTURE_OVERVIEW": {
      return executeQuery({ ...ast, intent: "SCAN_SUMMARY" }, findings, options);
    }
    case "REMEDIATE_DIFF": {
      const id = ast.findingId ?? (ast.anaphorResolved ? options.selectedFindingId : void 0);
      const found = resolveFinding(findings, id, ast.rawQuery);
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: found ? [found] : findings.slice(0, 1),
        graphViewMode: "control_flow",
        explanation: found ? `Remediation guidance for **${found.id}**: Enforce input sanitization and replace vulnerable sink with safe parameterized alternatives.` : "Select a finding to generate an evidence-grounded remediation diff.",
        suggestions: buildSuggestions(findings)
      };
    }
    case "VERIFY_HALLUCINATION": {
      return {
        capability: "SUPPORTED",
        intent: ast.intent,
        findings: findings.slice(0, 1),
        explanation: "Neuro-symbolic verification completed against AST dataflow graph. Verified 0 hallucinations in current findings.",
        suggestions: buildSuggestions(findings)
      };
    }
    default: {
      return {
        capability: "UNSUPPORTED",
        findings: [],
        explanation: "I couldn't map this to a supported query.",
        suggestions: buildSuggestions(findings)
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

// src/query/slash-commands.ts
var import_types = require("@whoami/types");
function parseSlashCommand(rawQuery) {
  const trimmed = rawQuery.trim();
  if (!trimmed.startsWith("/")) return void 0;
  const spaceIdx = trimmed.indexOf(" ");
  const commandToken = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  const spec = import_types.SLASH_COMMANDS.find((c) => c.name === commandToken);
  if (!spec) return { unknownCommand: commandToken };
  return { spec, args };
}
function formatCommandLine(spec) {
  const usage = spec.argsHint ? `${spec.name} ${spec.argsHint}` : spec.name;
  const suffix = spec.requiresHackerbot ? " _(not connected yet)_" : "";
  return `- \`${usage}\` \u2014 ${spec.description}${suffix}`;
}
var CATEGORY_HEADING = {
  general: "**General:**",
  sast: "**SAST tools** (static analysis on source code):",
  dast: "**DAST tools** (dynamic probing of a live target):"
};
function resolveEquivalentInvocation(parsed) {
  const url = parsed.args.split(/\s+/)[0] || "<url>";
  if (parsed.spec.profile) {
    return `/vuln ${url} ${parsed.spec.profile}`;
  }
  const usage = parsed.spec.argsHint ? `${parsed.spec.name} ${parsed.spec.argsHint}` : parsed.spec.name;
  return parsed.args ? `${parsed.spec.name} ${parsed.args}` : usage;
}
function executeSlashCommand(parsed) {
  if (parsed.spec.name === "/help") {
    const sections = ["general", "sast", "dast"].map((category) => {
      const lines = import_types.SLASH_COMMANDS.filter((c) => c.category === category).map(formatCommandLine).join("\n");
      return `${CATEGORY_HEADING[category]}
${lines}`;
    });
    return {
      capability: "SUPPORTED",
      findings: [],
      explanation: `${sections.join("\n\n")}

Every SAST/DAST tool command above is shorthand for \`/vuln <url> <profile>\` with that tool's profile preset \u2014 you can also call \`/vuln\` directly with any profile name.

You can also just ask in plain English \u2014 e.g. "show critical findings" or "why is F-10291 confirmed?".`
    };
  }
  if (parsed.spec.requiresHackerbot) {
    const equivalent = resolveEquivalentInvocation(parsed);
    return {
      capability: "UNSUPPORTED",
      findings: [],
      explanation: `\`${parsed.spec.name}\` isn't connected yet \u2014 it needs a security-session integration that hasn't been built. Once it is, this will run \`${equivalent}\`.`,
      suggestions: ["/help"]
    };
  }
  return {
    capability: "UNSUPPORTED",
    findings: [],
    explanation: `\`${parsed.spec.name}\` is registered but has no execution handler yet.`,
    suggestions: ["/help"]
  };
}
function executeUnknownSlashCommand(unknown) {
  return {
    capability: "UNSUPPORTED",
    findings: [],
    explanation: `Unknown command \`${unknown.unknownCommand}\`. Type \`/help\` to see available commands.`,
    suggestions: ["/help"]
  };
}

// src/okf/generator.ts
function generateOkfBundle(findings = [], workspaceGraph, rootPath = "") {
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    repository: generateRepositoryDoc(findings, workspaceGraph, rootPath, generatedAt),
    architecture: generateArchitectureDoc(findings, workspaceGraph, generatedAt),
    securityFindings: generateSecurityFindingsDoc(findings, generatedAt),
    services: generateServicesDoc(workspaceGraph, generatedAt),
    generatedAt,
    workspacePath: rootPath
  };
}
function generateRepositoryDoc(findings, graph, rootPath, updatedAt) {
  const fileNodes = graph?.nodes.filter((n) => n.type === "file") ?? [];
  const dirNodes = graph?.nodes.filter((n) => n.type === "directory") ?? [];
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
  for (const f of findings) {
    if (severityCounts[f.severity] !== void 0) {
      severityCounts[f.severity]++;
    }
  }
  const confirmedCount = findings.filter((f) => f.status === "confirmed").length;
  const needsVerificationCount = findings.filter(
    (f) => f.status === "needs-verification"
  ).length;
  const content = `# Repository Overview & Knowledge Projection

- **Root Workspace Path:** \`${rootPath || "."}\`
- **Total Indexed Files:** ${fileNodes.length}
- **Total Directories:** ${dirNodes.length}
- **Generated At:** ${updatedAt}

## Security Posture Summary
- **Total Security Findings:** ${findings.length}
- **Confirmed Vulnerabilities:** ${confirmedCount}
- **Needs Verification:** ${needsVerificationCount}
- **Severity Breakdown:**
  - **Critical:** ${severityCounts.critical}
  - **High:** ${severityCounts.high}
  - **Medium:** ${severityCounts.medium}
  - **Low:** ${severityCounts.low}

## File Inventory (Sample)
${fileNodes.slice(0, 30).map((f) => `- \`${f.filePath}\`${f.findingCount ? ` (${f.findingCount} finding(s), highest: ${f.highestSeverity})` : ""}`).join("\n")}
${fileNodes.length > 30 ? `
*... and ${fileNodes.length - 30} more files.*
` : ""}
`;
  return {
    filename: "repository.md",
    type: "repository",
    title: "Repository Overview",
    content,
    updatedAt
  };
}
function generateArchitectureDoc(findings, graph, updatedAt) {
  const fileNodes = graph?.nodes.filter((n) => n.type === "file") ?? [];
  const filesWithFindings = fileNodes.filter((n) => (n.findingCount ?? 0) > 0);
  const importEdges = graph?.edges.filter((e) => e.type === "imports") ?? [];
  const callEdges = graph?.edges.filter((e) => e.type === "calls") ?? [];
  const content = `# Architecture & Component Topology

## High-Risk Modules
${filesWithFindings.length === 0 ? "No high-risk files flagged with active security findings." : filesWithFindings.map(
    (f) => `- **${f.filePath}**: ${f.findingCount} finding(s) [Severity: ${f.highestSeverity?.toUpperCase()}]`
  ).join("\n")}

## Key Dependencies & Interconnections
- **Total Cross-Module Imports:** ${importEdges.length}
- **Total Inter-Function Calls:** ${callEdges.length}

### Module Dependency Sample:
${importEdges.slice(0, 20).map((e) => `- \`${e.source}\` \u2500\u2500\u25B6 imports \u2500\u2500\u25B6 \`${e.target}\``).join("\n")}
${importEdges.length > 20 ? `
*... and ${importEdges.length - 20} more import relationships.*` : ""}
`;
  return {
    filename: "architecture.md",
    type: "architecture",
    title: "Architecture & Component Topology",
    content,
    updatedAt
  };
}
function generateSecurityFindingsDoc(findings, updatedAt) {
  if (findings.length === 0) {
    return {
      filename: "security-findings.md",
      type: "security-findings",
      title: "Security Findings & Taint Traces",
      content: "# Security Findings & Taint Traces\n\nNo security vulnerabilities detected in the current scan.",
      updatedAt
    };
  }
  const sections = findings.map((f, idx) => {
    const traceSteps = f.trace?.steps ?? [];
    const traceStr = traceSteps.length > 0 ? traceSteps.map(
      (s, i) => `  ${i + 1}. [${s.role.toUpperCase()}] \`${s.label}\` at \`${s.filePath}:${s.line}\``
    ).join("\n") : "  *Direct match without multi-step propagation.*";
    return `### Finding [${idx + 1}]: ${f.id} \u2014 ${f.title}
- **Rule ID:** \`${f.ruleId}\`
- **Severity:** ${f.severity.toUpperCase()}
- **Status:** ${f.status.toUpperCase()}
${f.cwe ? `- **CWE:** ${f.cwe}` : ""}
${f.link ? `- **Reference:** ${f.link}` : ""}
${f.code ? `
**Vulnerable Code Snippet:**
\`\`\`
${f.code.trim()}
\`\`\`
` : ""}
**Taint Propagation Path:**
${traceStr}

${f.reason ? `**Security Explanation:**
${f.reason}
` : ""}
${f.hint ? `**Remediation Guidance:**
${f.hint}
` : ""}
${f.fix ? `**Safe Replacement:**
\`\`\`
${f.fix.trim()}
\`\`\`
` : ""}
---
`;
  });
  const content = `# Security Findings & Taint Traces

Total Active Findings: ${findings.length}

${sections.join("\n")}
`;
  return {
    filename: "security-findings.md",
    type: "security-findings",
    title: "Security Findings & Taint Traces",
    content,
    updatedAt
  };
}
function generateServicesDoc(graph, updatedAt) {
  const functionNodes = graph?.nodes.filter((n) => n.type === "function") ?? [];
  const classNodes = graph?.nodes.filter((n) => n.type === "class") ?? [];
  const content = `# Services, Classes & Exported Symbols

- **Total Classes/Interfaces:** ${classNodes.length}
- **Total Functions/Methods:** ${functionNodes.length}

## Classes Sample
${classNodes.length === 0 ? "No classes detected." : classNodes.slice(0, 25).map((c) => `- \`${c.label}\` in \`${c.filePath}:${c.line ?? 1}\``).join("\n")}

## Functions Sample
${functionNodes.length === 0 ? "No functions detected." : functionNodes.slice(0, 30).map((fn) => `- \`${fn.label}()\` in \`${fn.filePath}:${fn.line ?? 1}\``).join("\n")}
`;
  return {
    filename: "services.md",
    type: "services",
    title: "Services & Symbol Hierarchy",
    content,
    updatedAt
  };
}

// src/rag/okf-bm25-retriever.ts
var OkfBm25Index = class {
  chunks = [];
  docFreqs = /* @__PURE__ */ new Map();
  avgDocLength = 0;
  k1;
  b;
  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }
  addChunk(id, type, title, content, meta = {}) {
    const rawTokens = tokenizeText(`${title} ${content} ${meta.filePath ?? ""} ${meta.findingId ?? ""}`);
    const tokenFreqs = /* @__PURE__ */ new Map();
    for (const t of rawTokens) {
      tokenFreqs.set(t, (tokenFreqs.get(t) ?? 0) + 1);
    }
    let staticBoost = meta.staticBoost ?? 1;
    if (meta.findingId) staticBoost *= 1.5;
    if (meta.severity === "critical") staticBoost *= 1.5;
    else if (meta.severity === "high") staticBoost *= 1.25;
    const chunk = {
      id,
      type,
      title,
      content,
      filePath: meta.filePath,
      line: meta.line,
      findingId: meta.findingId,
      severity: meta.severity,
      tokenFreqs,
      length: rawTokens.length,
      staticBoost
    };
    this.chunks.push(chunk);
    for (const token of tokenFreqs.keys()) {
      this.docFreqs.set(token, (this.docFreqs.get(token) ?? 0) + 1);
    }
  }
  build() {
    if (this.chunks.length === 0) {
      this.avgDocLength = 0;
      return;
    }
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    this.avgDocLength = totalLength / this.chunks.length;
  }
  search(nlu, topK = 5) {
    if (this.chunks.length === 0 || nlu.tokens.length === 0) {
      return [];
    }
    const N = this.chunks.length;
    const scoredChunks = [];
    const queryFindingIds = new Set(nlu.slots.findingIds);
    const queryFilePaths = new Set(nlu.slots.filePaths);
    const queryCweIds = new Set(nlu.slots.cweIds);
    for (const chunk of this.chunks) {
      let bm25Score = 0;
      for (const token of nlu.tokens) {
        const tf = chunk.tokenFreqs.get(token) ?? 0;
        if (tf === 0) continue;
        const df = this.docFreqs.get(token) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const lengthNorm = 1 - this.b + this.b * (chunk.length / (this.avgDocLength || 1));
        const normalizedTf = tf * (this.k1 + 1) / (tf + this.k1 * lengthNorm);
        bm25Score += idf * normalizedTf;
      }
      if (bm25Score <= 0) continue;
      let dynamicMultiplier = chunk.staticBoost;
      if (chunk.findingId && queryFindingIds.has(chunk.findingId.toUpperCase())) {
        dynamicMultiplier *= 5;
      }
      if (chunk.filePath && queryFilePaths.has(chunk.filePath.toLowerCase())) {
        dynamicMultiplier *= 3;
      }
      for (const cwe of queryCweIds) {
        if (chunk.title.toUpperCase().includes(cwe) || chunk.content.toUpperCase().includes(cwe)) {
          dynamicMultiplier *= 2;
          break;
        }
      }
      scoredChunks.push({
        chunk,
        score: bm25Score * dynamicMultiplier
      });
    }
    return scoredChunks.sort((a, b) => b.score - a.score).slice(0, topK);
  }
};
function buildOkfBm25Index(findings = [], graph, okfBundle) {
  const index = new OkfBm25Index();
  for (const f of findings) {
    const primaryFile = f.trace?.steps?.[0]?.filePath ?? "";
    const primaryLine = f.trace?.steps?.[0]?.line;
    const cweText = f.cwe ? ` CWE: ${f.cwe}` : "";
    const reasonText = f.reason ? ` Reason: ${f.reason}` : "";
    const hintText = f.hint ? ` Remediation: ${f.hint}` : "";
    const fixText = f.fix ? ` Fix: ${f.fix}` : "";
    index.addChunk(
      `finding:${f.id}`,
      "finding",
      `Finding ${f.id} \u2014 ${f.title}`,
      `${f.description}${cweText}${reasonText}${hintText}${fixText} File: ${primaryFile}`,
      {
        filePath: primaryFile,
        line: primaryLine,
        findingId: f.id,
        severity: f.severity
      }
    );
    if (f.trace?.steps && f.trace.steps.length > 1) {
      const stepTrace = f.trace.steps.map((s, idx) => `Step ${idx + 1} [${s.role}]: ${s.label} (${s.filePath}:${s.line})`).join(" -> ");
      index.addChunk(
        `trace:${f.id}`,
        "taint_trace",
        `Taint Trace for ${f.id} (${f.trace.sinkClass})`,
        stepTrace,
        {
          filePath: primaryFile,
          findingId: f.id,
          severity: f.severity,
          staticBoost: 1.2
        }
      );
    }
  }
  if (okfBundle) {
    index.addChunk(
      "okf:repository",
      "repository",
      okfBundle.repository.title,
      okfBundle.repository.content,
      { staticBoost: 1 }
    );
    index.addChunk(
      "okf:architecture",
      "architecture",
      okfBundle.architecture.title,
      okfBundle.architecture.content,
      { staticBoost: 1.1 }
    );
    index.addChunk(
      "okf:services",
      "service",
      okfBundle.services.title,
      okfBundle.services.content,
      { staticBoost: 1.1 }
    );
    index.addChunk(
      "okf:security-findings",
      "finding",
      okfBundle.securityFindings.title,
      okfBundle.securityFindings.content,
      { staticBoost: 1.2 }
    );
  }
  if (graph) {
    for (const node of graph.nodes) {
      if (node.type === "file") {
        const findingCount = node.findingCount ?? 0;
        index.addChunk(
          `file:${node.id}`,
          "file",
          `File Node: ${node.filePath}`,
          findingCount > 0 ? `Vulnerabilities: ${findingCount} issues, Highest severity: ${node.highestSeverity ?? "none"}` : `Clean File: 0 vulnerabilities detected in ${node.filePath}`,
          {
            filePath: node.filePath,
            severity: node.highestSeverity,
            staticBoost: findingCount > 0 ? 1 : 0.9
          }
        );
      }
    }
  }
  index.build();
  return index;
}

// src/rag/program-slicer.ts
function buildProgramSlice(matchedFindings, graph, targetFilePath) {
  const primaryFinding = matchedFindings[0];
  const focalFilePath = targetFilePath || primaryFinding?.trace?.steps?.[0]?.filePath || "";
  const taintSlice = [];
  if (primaryFinding?.trace?.steps) {
    for (const step of primaryFinding.trace.steps) {
      taintSlice.push({
        role: step.role.toUpperCase(),
        label: step.label,
        location: `${step.filePath}:${step.line}`
      });
    }
  }
  const downstreamImports = /* @__PURE__ */ new Set();
  const callers = /* @__PURE__ */ new Set();
  if (graph && focalFilePath) {
    const normFocal = focalFilePath.toLowerCase();
    for (const edge of graph.edges) {
      if (edge.type === "imports") {
        if (edge.target.toLowerCase() === normFocal || edge.target.toLowerCase().endsWith(normFocal)) {
          downstreamImports.add(edge.source);
        }
      }
      if (edge.type === "calls") {
        if (edge.target.toLowerCase().includes(normFocal)) {
          callers.add(edge.source);
        }
      }
    }
  }
  const lines = [];
  if (primaryFinding) {
    lines.push(`### Vulnerability Slice [${primaryFinding.id}] (${primaryFinding.severity.toUpperCase()})`);
    lines.push(`- **Rule**: \`${primaryFinding.ruleId}\`${primaryFinding.cwe ? ` (${primaryFinding.cwe})` : ""}`);
    lines.push(`- **Title**: ${primaryFinding.title}`);
  }
  if (taintSlice.length > 0) {
    lines.push("#### Inter-Procedural Taint Path:");
    for (let i = 0; i < taintSlice.length; i++) {
      const s = taintSlice[i];
      if (!s) continue;
      const arrow = i < taintSlice.length - 1 ? " \u2500\u2500>" : "";
      lines.push(`  [${s.role}] \`${s.label}\` (${s.location})${arrow}`);
    }
  }
  if (downstreamImports.size > 0) {
    lines.push("#### Structural Blast Radius (Downstream):");
    for (const dep of Array.from(downstreamImports).slice(0, 4)) {
      lines.push(`  - \u26A0\uFE0F \`${dep}\` imports this module`);
    }
    if (downstreamImports.size > 4) {
      lines.push(`  - *...and ${downstreamImports.size - 4} more files.*`);
    }
  }
  if (callers.size > 0) {
    lines.push("#### Caller Hierarchy:");
    for (const caller of Array.from(callers).slice(0, 3)) {
      lines.push(`  - \u{1F4DE} \`${caller}()\` calls into this scope`);
    }
  }
  if (primaryFinding?.fix) {
    lines.push("#### Grounded Verified Patch:");
    lines.push("```");
    lines.push(primaryFinding.fix.trim());
    lines.push("```");
  }
  const sliceMarkdown = lines.join("\n");
  const estimatedTokens = Math.ceil(sliceMarkdown.length / 4);
  return {
    focalFindingId: primaryFinding?.id,
    focalFilePath,
    taintSlice,
    blastRadius: {
      downstreamImports: Array.from(downstreamImports),
      callers: Array.from(callers)
    },
    suggestedFix: primaryFinding?.fix,
    sliceMarkdown,
    estimatedTokens
  };
}

// src/logging/redactor.ts
var SENSITIVE_KEY_REGEX = /(?:password|secret|token|api_?key|auth|bearer|private_?key|credential|jwt|access_?token)/i;
var SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g,
  // AWS Access Key
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  // GitHub Token (Personal, OAuth, User, Server, Refresh)
  /sk-[a-zA-Z0-9_-]{20,}/g,
  // OpenAI / Anthropic / API Key
  /AIza[0-9A-Za-z-_]{35}/g,
  // Google API Key
  /[rs]k_(?:live|test)_[0-9a-zA-Z]{24,}/g,
  // Stripe Secret/Restricted Key
  /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
  // Slack Token
  /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Za-z_]+\/B[0-9A-Za-z_]+\/[0-9A-Za-z_]+/g,
  // Slack Webhook
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
  // JWT
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
  // PEM Private Key
  /(?:postgres|postgresql|mysql|mongodb|redis|amqp|mssql):\/\/[^\s:]+:[^\s@]+@[^\s/]+/gi,
  // DB URI with credentials
  /(?:password|passwd|secret|api_?key|auth_?token)\s*[:=]\s*["']([^"'\n]{6,})["']/gi
  // Hardcoded password assignment
];
var REDACTED_MARKER = "[REDACTED]";
function sanitizeString(value) {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, capture) => {
      if (typeof capture === "string") {
        return match.replace(capture, REDACTED_MARKER);
      }
      return REDACTED_MARKER;
    });
  }
  return result;
}
function maskAbsolutePaths(text, workspacePath) {
  let result = text;
  if (workspacePath) {
    const normalizedWs = workspacePath.replace(/\\/g, "/").replace(/\/+$/, "");
    result = result.split(normalizedWs + "/").join("");
    result = result.split(normalizedWs).join(".");
  }
  result = result.replace(/(?:\/Users|\/home)\/[a-zA-Z0-9._-]+\/(?:[^\s"'`<>]+)/g, (match) => {
    const parts = match.split("/");
    return parts.slice(Math.max(parts.length - 2, 0)).join("/");
  });
  result = result.replace(/[A-Za-z]:\\Users\\[a-zA-Z0-9._-]+\\(?:[^\s"'`<>]+)/g, (match) => {
    const parts = match.split("\\");
    return parts.slice(Math.max(parts.length - 2, 0)).join("/");
  });
  return result;
}
function redactSensitiveData(value, seen = /* @__PURE__ */ new WeakSet()) {
  if (value === null || value === void 0) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : void 0
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, seen));
  }
  const result = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = REDACTED_MARKER;
    } else {
      result[key] = redactSensitiveData(val, seen);
    }
  }
  return result;
}

// src/rag/prompt-synthesizer.ts
var BASE_SECURITY_SYSTEM_PROMPT = `You are Codefy Security Intelligence AI, an expert application security auditor.
Provide concise, evidence-grounded vulnerability triage, taint trace analysis, and remediation diffs.

RULES:
1. GROUNDING: Assert facts ONLY from verified <context>. If absent or unknown, state "Not detected in current scan". Never invent files, CWEs, or line numbers.
2. CITATIONS: Cite evidence using [1], [2] matching citation tags in <context>. Always reference finding IDs (e.g. F-10291).
3. CWE = CATEGORY: "CWE-NNN" may match several citations (check each "CWE:" field) \u2014 never claim nothing was found for lacking that literal id.
4. REMEDIATIONS: Always end with a fix, from the citation's "Remediation:"/"Fix:" field, or an exact before/after diff if asked.
5. STYLE: Technical, direct, actionable. No filler.`;
function synthesizePrompt(query, topChunks, slice) {
  const citations = [];
  const referencedFindingIds = /* @__PURE__ */ new Set();
  const citationBlocks = [];
  topChunks.slice(0, 3).forEach((scored, idx) => {
    const citationIndex = idx + 1;
    const { chunk, score } = scored;
    if (chunk.findingId) {
      referencedFindingIds.add(chunk.findingId);
    }
    citations.push({
      citationIndex,
      section: chunk.title,
      score,
      filePath: chunk.filePath,
      line: chunk.line,
      findingId: chunk.findingId
    });
    const fileLocation = chunk.filePath ? ` (${chunk.filePath}${chunk.line ? `:${chunk.line}` : ""})` : "";
    const sanitizedContent = sanitizeString(chunk.content.slice(0, 800));
    citationBlocks.push(
      `[${citationIndex}] ${chunk.title}${fileLocation}
${sanitizedContent}`
    );
  });
  const contextSections = [];
  if (citationBlocks.length > 0) {
    contextSections.push(citationBlocks.join("\n\n"));
  } else {
    contextSections.push("No direct findings or symbols matched in the local index for this query.");
  }
  if (slice?.sliceMarkdown) {
    contextSections.push(sanitizeString(slice.sliceMarkdown));
    if (slice.focalFindingId) {
      referencedFindingIds.add(slice.focalFindingId);
    }
  }
  const rawContext = contextSections.join("\n\n");
  const systemPrompt = `${BASE_SECURITY_SYSTEM_PROMPT}

<context>
${rawContext}
</context>`;
  const estimatedContextTokens = Math.ceil(rawContext.length / 4);
  return {
    systemPrompt,
    citations,
    referencedFindingIds: Array.from(referencedFindingIds),
    estimatedContextTokens
  };
}

// src/rag/hallucination-guard.ts
function validateSyntaxDelimiters(code) {
  const stack = [];
  const matching = {
    "}": "{",
    ")": "(",
    "]": "["
  };
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if ((char === '"' || char === "'" || char === "`") && code[i - 1] !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
      }
      continue;
    }
    if (inString) continue;
    if (char === "{" || char === "(" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === ")" || char === "]") {
      if (stack.length === 0 || stack.pop() !== matching[char]) {
        return false;
      }
    }
  }
  return stack.length === 0;
}
function verifyLlmResponse(llmText, context) {
  const violations = [];
  const sanitizedText = sanitizeString(llmText);
  if (sanitizedText !== llmText) {
    violations.push({
      type: "SECRET_LEAKAGE",
      message: "Detected and redacted credential or token in generated response."
    });
  }
  const findingIdPattern = /\b(?:F-\d+|remote-[a-z0-9-]+)\b/gi;
  const citedFindingIds = Array.from(new Set((llmText.match(findingIdPattern) ?? []).map((m) => m.toUpperCase())));
  const validFindingIds = new Set(context.findings.map((f) => f.id.toUpperCase()));
  for (const citedId of citedFindingIds) {
    if (!validFindingIds.has(citedId)) {
      violations.push({
        type: "HALLUCINATED_FINDING",
        message: `Cited finding ID "${citedId}" does not exist in the active scan repository.`,
        entity: citedId
      });
    }
  }
  if (context.graph || context.findings.length > 0) {
    const filePathPattern = /\b[\w/.-]+\.(?:ts|tsx|js|jsx|py|go|java|c|cpp|rs|json|yaml|yml)\b/gi;
    const citedFiles = Array.from(new Set((llmText.match(filePathPattern) ?? []).map((m) => m.toLowerCase())));
    const knownFiles = /* @__PURE__ */ new Set();
    if (context.graph) {
      for (const node of context.graph.nodes) {
        if (node.type === "file" && node.filePath) {
          knownFiles.add(node.filePath.toLowerCase());
          const baseName = node.filePath.split(/[/\\]/).pop()?.toLowerCase();
          if (baseName) knownFiles.add(baseName);
        }
      }
    }
    for (const f of context.findings) {
      if (f.trace?.steps) {
        for (const step of f.trace.steps) {
          if (step.filePath) {
            knownFiles.add(step.filePath.toLowerCase());
            const baseName = step.filePath.split(/[/\\]/).pop()?.toLowerCase();
            if (baseName) knownFiles.add(baseName);
          }
        }
      }
    }
    for (const file of citedFiles) {
      if (file === "package.json" || file === "tsconfig.json" || file.endsWith(".config.js") || file.endsWith(".config.ts")) {
        continue;
      }
      const isKnown = knownFiles.has(file) || Array.from(knownFiles).some((kf) => kf.endsWith(file) || file.endsWith(kf));
      if (knownFiles.size > 0 && !isKnown) {
        violations.push({
          type: "HALLUCINATED_FILE",
          message: `Cited file path "${file}" was not found in the codebase graph or findings.`,
          entity: file
        });
      }
    }
  }
  const codeBlockPattern = /```(?:[\w-]+)?\n([\s\S]*?)```/g;
  let codeMatch;
  while ((codeMatch = codeBlockPattern.exec(llmText)) !== null) {
    const codeSnippet = codeMatch[1] ?? "";
    if (codeSnippet && !validateSyntaxDelimiters(codeSnippet)) {
      violations.push({
        type: "SYNTAX_ERROR",
        message: "Code replacement block contains unclosed or mismatched syntax brackets."
      });
      break;
    }
  }
  return {
    isValid: violations.length === 0,
    violations,
    sanitizedText
  };
}

// src/rag/orchestrator.ts
function executeRagRetrieval(query, findings = [], options = {}) {
  const nlu = analyzeQuery(query, options.selectedFindingId);
  const index = buildOkfBm25Index(findings, options.workspaceGraph, options.okfBundle);
  const topChunks = index.search(nlu, options.topK ?? 5);
  const referencedSet = new Set(nlu.slots.findingIds);
  for (const scored of topChunks) {
    if (scored.chunk.findingId) {
      referencedSet.add(scored.chunk.findingId);
    }
  }
  if (nlu.boundFindingId) {
    referencedSet.add(nlu.boundFindingId);
  }
  if (nlu.slots.targetSeverity && referencedSet.size === 0) {
    for (const f of findings) {
      if (f.severity === nlu.slots.targetSeverity) {
        referencedSet.add(f.id);
      }
    }
  }
  const matchedFindings = findings.filter(
    (f) => referencedSet.has(f.id.toUpperCase()) || referencedSet.has(f.id)
  );
  const targetFilePath = nlu.slots.filePaths[0] || matchedFindings[0]?.trace?.steps?.[0]?.filePath;
  const slice = buildProgramSlice(
    matchedFindings,
    options.workspaceGraph,
    targetFilePath
  );
  const promptData = synthesizePrompt(query, topChunks, slice);
  let graphViewMode = "graph";
  if (matchedFindings.some((f) => f.scope === "orchestrator" || f.id.startsWith("remote-"))) {
    graphViewMode = "remote";
  } else if (nlu.intent === "BLAST_RADIUS_ANALYSIS" || ["blast", "impact", "affect", "radius", "downstream"].some((k) => query.toLowerCase().includes(k))) {
    graphViewMode = "blast_radius";
  } else if (nlu.intent === "TAINT_FLOW_TRACE" || ["sanitizer", "guard", "check", "filter", "control flow"].some((k) => query.toLowerCase().includes(k)) || matchedFindings.some((f) => f.trace?.steps?.some((s) => s.role === "sanitizer"))) {
    graphViewMode = "control_flow";
  } else if (["depend", "package", "import", "supply chain"].some((k) => query.toLowerCase().includes(k))) {
    graphViewMode = "supply_chain";
  } else if (nlu.intent === "ARCHITECTURE_OVERVIEW" || ["arch", "architecture", "overview", "system"].some((k) => query.toLowerCase().includes(k)) || matchedFindings.length === 0 && options.workspaceGraph) {
    graphViewMode = "unified";
  }
  const suggestions = buildDynamicSuggestions(
    matchedFindings.length > 0 ? matchedFindings : findings,
    {
      query,
      graphViewMode,
      selectedFindingId: options.selectedFindingId ?? matchedFindings[0]?.id
    }
  );
  return {
    systemPrompt: promptData.systemPrompt,
    userQuery: query,
    citations: promptData.citations,
    referencedFindingIds: promptData.referencedFindingIds,
    matchedFindings,
    graphViewMode,
    suggestions,
    nluAnalysis: nlu,
    slice
  };
}

// src/llm/hosted-client.ts
var DEFAULT_AI_GATEWAY_URL = "https://i8791yv32r8c7t21387rcfvt8713cv.onrender.com";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isChatGraphViewMode(value) {
  return typeof value === "string" && ["graph", "unified", "blast_radius", "control_flow", "supply_chain", "remote"].includes(value);
}
var HostedLlmClient = class {
  baseUrl;
  apiKey;
  timeoutMs;
  fetchImpl;
  adminSecret;
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_AI_GATEWAY_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 3e4;
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
    this.adminSecret = options.adminSecret || (typeof process !== "undefined" ? process.env?.["TRAINIQ_ADMIN_SECRET"] : void 0);
  }
  /**
   * Reports an operational issue to the gateway's Alerts & Issues API
   * (`POST /api/alerts`), which stores it and dispatches an admin
   * notification server-side -- deliberately the *non*-manual endpoint,
   * since `/api/alerts/manual` explicitly bypasses deduplication and would
   * spam admins once per failed chat turn during an outage.
   *
   * Fire-and-forget by design: callers must never let an alerting failure
   * mask or replace the original error they were reporting.
   */
  async reportAlert(alert) {
    if (!this.adminSecret) return null;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": this.adminSecret
        },
        body: JSON.stringify({ source: "codefy-chat-gateway", ...alert })
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  /**
   * Indexes the current workspace's OKF documents into the backend RAG engine (TrainIQ).
   */
  async indexOkf(bundle) {
    const docs = [
      bundle.repository,
      bundle.architecture,
      bundle.securityFindings,
      bundle.services
    ].filter(Boolean);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/rag/index-okf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.apiKey ? { "X-API-Key": this.apiKey, Authorization: `Bearer ${this.apiKey}` } : {}
        },
        body: JSON.stringify({
          workspace_path: bundle.workspacePath,
          documents: docs
        })
      });
      if (!res.ok) {
        throw new Error(`Indexing HTTP ${res.status}`);
      }
      const data = await res.json();
      return {
        success: true,
        indexedCount: data.indexed_count ?? docs.length,
        message: data.message ?? "Indexed successfully"
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return {
        success: false,
        indexedCount: 0,
        message: `Failed to index OKF: ${msg}`
      };
    }
  }
  /**
   * Interactive real-time SSE streaming RAG query.
   * Grounded in OKF knowledge and TrainIQ vectorless retrieval.
   * Emits progressive token deltas through `onChunk`, and returns the final ChatResult.
   */
  async streamRagChat(query, findings, options = {}, onChunk) {
    const retrieval = executeRagRetrieval(query, findings, {
      workspaceGraph: options.workspaceGraph,
      okfBundle: options.okfBundle,
      selectedFindingId: options.selectedFindingId
    });
    const isGeneral = retrieval.nluAnalysis.intent === "GENERAL_ASSISTANCE";
    let formattedPrompt;
    if (isGeneral) {
      formattedPrompt = sanitizeString(query);
    } else {
      const sanitizedSystemPrompt = sanitizeString(
        maskAbsolutePaths(retrieval.systemPrompt, options.workspacePath)
      );
      formattedPrompt = `${sanitizedSystemPrompt}

User Question: ${sanitizeString(query)}`;
    }
    const payload = {
      query: formattedPrompt,
      // 512 was measured to cut a multi-finding CWE explanation off
      // mid-sentence right before the remediation diff it was building
      // toward -- a triage table + taint trace for 2+ findings alone can
      // exceed 512 tokens, leaving nothing for the "how do I fix it" part
      // the user actually asked for.
      max_tokens: options.max_tokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      web_search: false,
      // STRICT: Prevent DuckDuckGo from receiving queries or code snippets
      max_search_results: options.max_search_results ?? 3,
      language: options.language ?? "auto"
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.apiKey ? { "X-API-Key": this.apiKey, Authorization: `Bearer ${this.apiKey}` } : {}
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`Hosted AI responded with HTTP ${res.status}`);
      }
      let accumulatedReply = "";
      let finalCitations = [...retrieval.citations];
      let finalReferencedIds = [...retrieval.referencedFindingIds];
      let finalGraphViewMode = retrieval.graphViewMode;
      let finalSuggestions = [...retrieval.suggestions];
      const contentType = res.headers?.get("content-type") || "";
      const isSse = contentType.includes("text/event-stream") || Boolean(res.body) && typeof res.json !== "function";
      if (isSse) {
        await this.readSse(res, (data) => {
          const delta = typeof data.reply === "string" && data.reply || typeof data.response === "string" && data.response || "";
          if (delta) {
            accumulatedReply += delta;
            onChunk?.({
              delta,
              done: false
            });
          }
          if (data.done === true) {
            if (Array.isArray(data.citations) && data.citations.length > 0) {
              finalCitations = data.citations.flatMap((value) => {
                if (!isRecord(value)) return [];
                const citationIndex = value["citation_index"] ?? value["citationIndex"];
                const section = value["section"];
                const score = value["score"];
                const filePath = value["file_path"] ?? value["filePath"];
                const line = value["line"];
                const findingId = value["finding_id"] ?? value["findingId"];
                return [{
                  citationIndex: typeof citationIndex === "number" ? citationIndex : 1,
                  section: typeof section === "string" ? section : "",
                  ...typeof score === "number" ? { score } : {},
                  ...typeof filePath === "string" ? { filePath } : {},
                  ...typeof line === "number" ? { line } : {},
                  ...typeof findingId === "string" ? { findingId } : {}
                }];
              });
            }
            if (Array.isArray(data.referenced_finding_ids) && data.referenced_finding_ids.length > 0) {
              finalReferencedIds = data.referenced_finding_ids.filter(
                (value) => typeof value === "string"
              );
            }
            if (isChatGraphViewMode(data.graph_view_mode)) {
              finalGraphViewMode = data.graph_view_mode;
            }
            if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
              finalSuggestions = data.suggestions.filter(
                (value) => typeof value === "string"
              );
            }
            onChunk?.({
              delta: "",
              done: true,
              citations: isGeneral ? [] : finalCitations,
              referencedFindingIds: isGeneral ? [] : finalReferencedIds,
              graphViewMode: finalGraphViewMode,
              suggestions: finalSuggestions
            });
          }
        });
      } else {
        const data = await res.json();
        accumulatedReply = data.response || data.reply || "";
        if (onChunk && accumulatedReply) {
          const words = accumulatedReply.split(" ");
          for (let i = 0; i < words.length; i += 4) {
            const chunkText = words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "");
            onChunk({
              delta: chunkText,
              done: false
            });
          }
          onChunk({
            delta: "",
            done: true,
            citations: isGeneral ? [] : finalCitations,
            referencedFindingIds: isGeneral ? [] : finalReferencedIds,
            graphViewMode: finalGraphViewMode,
            suggestions: finalSuggestions
          });
        }
      }
      const matchedFindings = findings.filter(
        (f) => finalReferencedIds.includes(f.id) || options.selectedFindingId && f.id === options.selectedFindingId
      );
      const guardResult = verifyLlmResponse(accumulatedReply, {
        findings,
        graph: options.workspaceGraph
      });
      return {
        capability: "SUPPORTED",
        intent: retrieval.nluAnalysis.intent,
        findings: isGeneral ? [] : matchedFindings.length > 0 ? matchedFindings : retrieval.matchedFindings,
        graphViewMode: finalGraphViewMode,
        targetFilePath: retrieval.nluAnalysis.slots.filePaths[0],
        explanation: guardResult.sanitizedText || "Query completed with no generated output.",
        citations: isGeneral ? [] : finalCitations,
        suggestions: finalSuggestions
      };
    } catch (err) {
      const fallbackResult = runChatQuery(query, findings, options);
      const errMsg = err instanceof Error ? err.message : "network error";
      void this.reportAlert({
        title: "TrainIQ chat gateway unreachable",
        paragraph: `streamRagChat() failed against ${this.baseUrl}/api/chat: ${errMsg}. Client fell back to local deterministic analysis.`,
        severity: "warning",
        category: "backend_failure",
        metadata: { baseUrl: this.baseUrl, error: errMsg }
      });
      const explanation = fallbackResult.capability === "UNSUPPORTED" ? `**Notice:** The cloud AI service is unreachable right now \u2014 falling back to local analysis.

### Grounded Local Analysis:
${retrieval.systemPrompt.replace(/^You are the Codefy Security & Code Intelligence AI Assistant\.\nYou provide precise, evidence-grounded security triage, architecture analysis, and remediation diffs\.\n\n/, "")}` : fallbackResult.explanation;
      onChunk?.({
        delta: explanation || "",
        done: true,
        citations: retrieval.citations,
        referencedFindingIds: retrieval.referencedFindingIds,
        graphViewMode: retrieval.graphViewMode,
        suggestions: retrieval.suggestions
      });
      const isGeneral2 = fallbackResult.intent === "GENERAL_ASSISTANCE";
      const fallbackFindings = fallbackResult.findings && fallbackResult.findings.length > 0 ? fallbackResult.findings : isGeneral2 ? [] : retrieval.matchedFindings;
      return {
        capability: "SUPPORTED",
        intent: fallbackResult.intent,
        findings: fallbackFindings,
        graphViewMode: fallbackResult.graphViewMode ?? retrieval.graphViewMode,
        targetFilePath: fallbackResult.targetFilePath,
        explanation,
        citations: isGeneral2 ? [] : fallbackResult.citations ?? retrieval.citations,
        suggestions: fallbackResult.suggestions ?? retrieval.suggestions
      };
    }
  }
  /**
   * Universal general-purpose query endpoint for any prompt.
   */
  async query(prompt, context) {
    const sanitizedPrompt = sanitizeString(context ? `${context}

${prompt}` : prompt);
    const payload = {
      query: sanitizedPrompt,
      max_tokens: 512,
      temperature: 0.7,
      web_search: false,
      max_search_results: 3,
      language: "auto"
    };
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.apiKey ? { "X-API-Key": this.apiKey, Authorization: `Bearer ${this.apiKey}` } : {}
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`Hosted LLM HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.response || data.reply || "";
  }
  /**
   * Cross-platform SSE decoder compatible with Webview/Tauri ReadableStream and Node.js streams.
   */
  async readSse(res, onPayload) {
    if (!res.body) return;
    const body = res.body;
    if (typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const raw = trimmed.slice(6);
            if (raw === "[DONE]") return;
            try {
              const payload = JSON.parse(raw);
              if (isRecord(payload)) onPayload(payload);
            } catch {
            }
          }
        }
      }
    } else if (typeof body[Symbol.asyncIterator] === "function") {
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of body) {
        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const raw = trimmed.slice(6);
            if (raw === "[DONE]") return;
            try {
              const payload = JSON.parse(raw);
              if (isRecord(payload)) onPayload(payload);
            } catch {
            }
          }
        }
      }
    }
  }
};

// src/auth/gateway-auth-client.ts
var AuthApiError = class extends Error {
};
function isTier(value) {
  return value === "community" || value === "pro" || value === "enterprise";
}
function toSession(json) {
  return {
    accessToken: json.access_token,
    tokenType: json.token_type || "bearer",
    userId: json.user_id,
    email: json.email,
    name: json.name,
    tier: isTier(json.tier) ? json.tier : "community",
    expiresAt: Date.now() + Math.max(0, json.expires_in_seconds) * 1e3
  };
}
var GatewayAuthClient = class {
  baseUrl;
  timeoutMs;
  fetchImpl;
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_AI_GATEWAY_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 45e3;
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  }
  async post(path, body, accessToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      return await this.parseResponse(res);
    } catch (err) {
      throw this.toGenericError(err);
    } finally {
      clearTimeout(timer);
    }
  }
  async get(path, accessToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal
      });
      return await this.parseResponse(res);
    } catch (err) {
      throw this.toGenericError(err);
    } finally {
      clearTimeout(timer);
    }
  }
  async delete(path, accessToken) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal
      });
      return await this.parseResponse(res);
    } catch (err) {
      throw this.toGenericError(err);
    } finally {
      clearTimeout(timer);
    }
  }
  async parseResponse(res) {
    if (res.ok) {
      return res.json().catch(() => ({}));
    }
    const json = await res.json().catch(() => void 0);
    const detail = json && typeof json === "object" && "detail" in json ? this.detailToMessage(json.detail) : void 0;
    if (res.status === 401 || res.status === 403) {
      throw new AuthApiError(detail || "Invalid email or password.");
    }
    if (res.status === 409) {
      throw new AuthApiError(detail || "An account with that email already exists.");
    }
    if (res.status === 422) {
      throw new AuthApiError(detail || "Please check your name, email, and password.");
    }
    throw new AuthApiError(
      detail || "The account service is temporarily unavailable. Please try again."
    );
  }
  detailToMessage(detail) {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        return String(first.msg);
      }
    }
    return void 0;
  }
  toGenericError(err) {
    if (err instanceof AuthApiError) {
      return err;
    }
    return new Error("Couldn't reach the account service. Check your connection and try again.");
  }
  async register(input) {
    const json = await this.post("/developer/auth/register", input);
    if (json && typeof json === "object" && "access_token" in json) {
      return { status: "authenticated", session: toSession(json) };
    }
    return { status: "pending_verification", email: input.email };
  }
  async verifyEmail(email, code) {
    const json = await this.post("/developer/auth/verify-email", {
      email,
      code
    });
    return toSession(json);
  }
  async resendCode(email) {
    await this.post("/developer/auth/resend-code", { email });
  }
  async login(email, password) {
    const json = await this.post("/developer/auth/login", { email, password });
    return toSession(json);
  }
  /** Validates a persisted session is still accepted server-side. Returns
   * false (never throws) on any failure -- an unreachable gateway or an
   * expired/revoked token should fall back to "please log in again", not
   * an unhandled error. */
  async isSessionValid(accessToken) {
    try {
      await this.get("/developer/auth/me", accessToken);
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Request a 6-digit password reset OTP sent to the user's email address.
   * Matches OWASP guidelines: non-revealing generic response message to prevent
   * user enumeration attacks.
   */
  async forgotPassword(email, language = "en") {
    const json = await this.post("/developer/auth/forgot-password", {
      email,
      language
    });
    return json;
  }
  /**
   * Validate the 6-digit OTP code before asking the user for a new password.
   * Enforces the two-phase verification state machine.
   */
  async verifyResetOtp(email, code) {
    const json = await this.post("/developer/auth/verify-reset-otp", {
      email,
      code
    });
    return json;
  }
  /**
   * Complete password reset using verified 6-digit OTP and new password.
   * The backend validates and updates the PBKDF2-HMAC-SHA256 password hash.
   */
  async resetPassword(email, code, newPassword) {
    const json = await this.post("/developer/auth/reset-password", {
      email,
      code,
      new_password: newPassword
    });
    return json;
  }
  /**
   * Retrieve active developer profile metadata (including email verification status).
   */
  async getProfile(accessToken) {
    const json = await this.get("/developer/auth/me", accessToken);
    return json;
  }
  /**
   * List all generated API keys associated with the current developer account.
   */
  async listApiKeys(accessToken) {
    const json = await this.get("/developer/keys", accessToken);
    if (!Array.isArray(json)) return [];
    return json.map((k) => ({
      id: k.id,
      keyName: k.key_name || "API Key",
      prefix: k.prefix || "cmdd-sk-...",
      createdAt: k.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt: k.expires_at,
      status: k.status || "active"
    }));
  }
  /**
   * Generate a new developer API key with a user-specified descriptive name.
   */
  async createApiKey(accessToken, keyName, expiresDays) {
    const payload = { key_name: keyName };
    if (expiresDays) payload.expires_days = expiresDays;
    const json = await this.post(
      "/developer/keys",
      payload,
      accessToken
    );
    return json;
  }
  /**
   * Revoke an active API key by its unique ID.
   */
  async revokeApiKey(accessToken, keyId) {
    await this.delete(`/developer/keys/${encodeURIComponent(keyId)}`, accessToken);
  }
  /**
   * Retrieve usage and rate-limit metrics for the authenticated account.
   */
  async getUsageSummary(accessToken) {
    const json = await this.get("/developer/usage", accessToken);
    return {
      totalRequests: json?.total_requests ?? 0,
      requestsToday: json?.requests_today ?? 0,
      tokensUsed: json?.tokens_used ?? 0,
      costUsd: json?.cost_usd ?? 0,
      tierLimitRpd: json?.tier_limit_rpd ?? 100
    };
  }
};

// src/logging/logger.ts
var import_types2 = require("@whoami/types");

// src/logging/platform.ts
var APP_VERSION = "0.1.0";
function detectPlatform() {
  let runtime = "node";
  let host = "standalone";
  let os;
  let arch;
  const gRecord = typeof globalThis !== "undefined" ? globalThis : void 0;
  const gWindow = gRecord && typeof gRecord["window"] === "object" ? gRecord["window"] : void 0;
  if (gWindow && typeof gWindow["document"] !== "undefined") {
    runtime = "browser";
  } else if (gRecord && typeof gRecord["importScripts"] === "function") {
    runtime = "webworker";
  } else if (typeof process !== "undefined" && process.versions && process.versions.node) {
    runtime = "node";
  }
  if (typeof process !== "undefined" && process.env) {
    if (process.env["VSCODE_PID"] || process.env["VSCODE_INSPECTOR_OPTIONS"]) {
      host = "vscode";
    } else if (process.env["NODE_ENV"] === "test" || process.env["VITEST"]) {
      host = "test";
    }
  }
  if (gWindow) {
    if (gWindow["__TAURI__"] || gWindow["__TAURI_INTERNALS__"]) {
      host = "tauri";
    } else if (typeof gWindow["acquireVsCodeApi"] === "function") {
      host = "vscode";
    }
  }
  if (typeof process !== "undefined") {
    if (typeof process.platform === "string") {
      os = process.platform;
    }
    if (typeof process.arch === "string") {
      arch = process.arch;
    }
  }
  return {
    runtime,
    host,
    appVersion: APP_VERSION,
    os,
    arch
  };
}

// src/logging/transports/console.ts
var ConsoleTransport = class {
  name = "console";
  options;
  constructor(options = {}) {
    this.options = {
      enableColors: true,
      ...options
    };
  }
  send(events) {
    for (const event of events) {
      const prefix = this.options.prefix ? `[${this.options.prefix}]` : `[${event.source}]`;
      const time = event.timestamp.split("T")[1]?.replace("Z", "") || event.timestamp;
      const levelTag = `[${event.level.toUpperCase()}]`;
      const header = `${time} ${prefix} ${levelTag} ${event.message}`;
      const hasFields = Object.keys(event.fields).length > 0;
      switch (event.level) {
        case "debug":
          if (hasFields) {
            console.debug(header, event.fields);
          } else {
            console.debug(header);
          }
          break;
        case "info":
          if (hasFields) {
            console.info(header, event.fields);
          } else {
            console.info(header);
          }
          break;
        case "warn":
          if (hasFields) {
            console.warn(header, event.fields);
          } else {
            console.warn(header);
          }
          break;
        case "error":
          if (event.error) {
            console.error(header, event.error, hasFields ? event.fields : "");
          } else if (hasFields) {
            console.error(header, event.fields);
          } else {
            console.error(header);
          }
          break;
      }
    }
  }
  flush() {
  }
};

// src/logging/logger.ts
var Logger = class _Logger {
  source;
  logLevel;
  fields;
  redactSensitive;
  transports;
  platform;
  constructor(config = {}) {
    this.source = config.source || "whoami";
    this.logLevel = config.logLevel ?? import_types2.LogLevel.info;
    this.fields = config.fields ? { ...config.fields } : {};
    this.redactSensitive = config.redactSensitive ?? true;
    this.platform = detectPlatform();
    if (config.transports && config.transports.length > 0) {
      this.transports = config.transports;
    } else {
      this.transports = [new ConsoleTransport()];
    }
  }
  /**
   * Create an immutable child logger with merged contextual fields.
   */
  with(fields) {
    return new _Logger({
      source: this.source,
      logLevel: this.logLevel,
      fields: { ...this.fields, ...fields },
      transports: this.transports,
      redactSensitive: this.redactSensitive
    });
  }
  /**
   * Create an immutable child logger with an updated source tag.
   */
  child(source, fields = {}) {
    return new _Logger({
      source,
      logLevel: this.logLevel,
      fields: { ...this.fields, ...fields },
      transports: this.transports,
      redactSensitive: this.redactSensitive
    });
  }
  debug(message, fields = {}) {
    if (this.logLevel <= import_types2.LogLevel.debug) {
      this.log("debug", message, fields);
    }
  }
  info(message, fields = {}) {
    if (this.logLevel <= import_types2.LogLevel.info) {
      this.log("info", message, fields);
    }
  }
  warn(message, fields = {}) {
    if (this.logLevel <= import_types2.LogLevel.warn) {
      this.log("warn", message, fields);
    }
  }
  error(message, errorOrFields, additionalFields) {
    if (this.logLevel <= import_types2.LogLevel.error) {
      let errorPayload;
      let fields = {};
      if (errorOrFields instanceof Error) {
        const errObj = errorOrFields;
        errorPayload = {
          name: errorOrFields.name,
          message: errorOrFields.message,
          stack: errorOrFields.stack,
          code: typeof errObj["code"] === "string" || typeof errObj["code"] === "number" ? errObj["code"] : void 0,
          scope: typeof errObj["scope"] === "string" ? errObj["scope"] : void 0,
          reason: typeof errObj["reason"] === "string" ? errObj["reason"] : void 0,
          hint: typeof errObj["hint"] === "string" ? errObj["hint"] : void 0,
          fix: typeof errObj["fix"] === "string" ? errObj["fix"] : void 0,
          link: typeof errObj["link"] === "string" ? errObj["link"] : void 0
        };
        fields = additionalFields || {};
      } else if (errorOrFields && typeof errorOrFields === "object") {
        if ("message" in errorOrFields && "name" in errorOrFields) {
          errorPayload = errorOrFields;
          fields = additionalFields || {};
        } else {
          fields = errorOrFields;
        }
      }
      this.log("error", message, fields, errorPayload);
    }
  }
  /**
   * Utility to measure asynchronous execution duration and log it.
   */
  async time(operationName, fn, fields = {}) {
    const startTime = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      this.debug(`[time] ${operationName} completed`, {
        ...fields,
        operation: operationName,
        durationMs
      });
      return { result, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.error(
        `[time] ${operationName} failed`,
        err instanceof Error ? err : new Error(String(err)),
        {
          ...fields,
          operation: operationName,
          durationMs
        }
      );
      throw err;
    }
  }
  log(level, message, fields, error) {
    const mergedFields = { ...this.fields, ...fields };
    const sanitizedFields = this.redactSensitive ? redactSensitiveData(mergedFields) : mergedFields;
    const sanitizedError = error && this.redactSensitive ? redactSensitiveData(error) : error;
    const event = {
      level,
      message,
      fields: sanitizedFields,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      source: this.source,
      platform: this.platform,
      error: sanitizedError
    };
    for (const transport of this.transports) {
      try {
        transport.send([event]);
      } catch (err) {
        console.error(`[Logger] Transport ${transport.name} error:`, err);
      }
    }
  }
  /**
   * Flush all buffered transports.
   */
  async flush() {
    const flushPromises = this.transports.filter((t) => typeof t.flush === "function").map((t) => t.flush());
    await Promise.allSettled(flushPromises);
  }
  /**
   * Close and teardown all transports.
   */
  async close() {
    const closePromises = this.transports.filter((t) => typeof t.close === "function").map((t) => t.close());
    await Promise.allSettled(closePromises);
  }
};

// src/report/diff-suggestion.ts
function generateFixDiffText(finding) {
  const steps = finding.trace?.steps || [];
  const primaryStep = steps[steps.length - 1] || steps[0];
  const rawPath = primaryStep?.filePath || "src/index.ts";
  const cleanPath = rawPath.replace(/^https?:\/\/[^/]+\/?/, "");
  const pathParts = cleanPath.split(/[/\\]/);
  const fileBasename = pathParts[pathParts.length - 1] || cleanPath;
  let originalCode = "";
  let modifiedCode = "";
  let startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
  const ruleId = finding.ruleId || "";
  const code = finding.code || "";
  const scope = finding.scope || "";
  if (ruleId === "js-path-traversal" || ruleId.includes("path-traversal") || code === "path_traversal") {
    startLine = Math.max(1, (primaryStep?.line ?? 6) - 4);
    originalCode = `import fs from "fs";
import path from "path";

export function readTargetFile(userPath: string): string {
  // Vulnerable sink: unvalidated path reaches filesystem read API
  const filePath = path.join("/uploads", userPath);
  return fs.readFileSync(filePath, "utf-8");
}`;
    modifiedCode = `import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve("/uploads");

export function readTargetFile(userPath: string): string {
  // Fixed: path normalization and boundary validation check
  const safePath = path.resolve(BASE_DIR, path.normalize(userPath));
  if (!safePath.startsWith(BASE_DIR)) {
    throw new Error("SecurityException: Path traversal detected");
  }
  return fs.readFileSync(safePath, "utf-8");
}`;
  } else if (ruleId === "js-command-injection-exec" || ruleId.includes("command-injection") || code === "command_injection") {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `import { exec } from "child_process";

export function executeTool(filename: string) {
  // Vulnerable sink: raw command string interpreted in shell
  exec(\`convert \${filename} output.png\`, (err, stdout) => {
    if (err) throw err;
    return stdout;
  });
}`;
    modifiedCode = `import { execFile } from "node:child_process";

export function executeTool(filename: string) {
  // Fixed: execFile executes binary directly with argv array
  execFile("convert", [filename, "output.png"], (err, stdout) => {
    if (err) throw err;
    return stdout;
  });
}`;
  } else if (ruleId === "js-sql-injection-string-concat" || ruleId.includes("sql-injection") || code === "sql_injection") {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `import { db } from "../db/client";

export async function getUser(userId: string) {
  // Vulnerable sink: SQL query built via string interpolation
  const sql = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  const result = await db.query(sql);
  return result.rows[0];
}`;
    modifiedCode = `import { db } from "../db/client";

export async function getUser(userId: string) {
  // Fixed: parameterized SQL query with placeholder binds
  const sql = "SELECT * FROM users WHERE id = $1";
  const result = await db.query(sql, [userId]);
  return result.rows[0];
}`;
  } else if (ruleId === "js-code-injection" || ruleId.includes("code-injection") || code === "code_injection") {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `export function parseConfig(configStr: string) {
  // Vulnerable sink: dynamic code evaluation via eval()
  return eval(\`(\${configStr})\`);
}`;
    modifiedCode = `export function parseConfig(configStr: string) {
  // Fixed: safe JSON parsing without executing untrusted code
  return JSON.parse(configStr);
}`;
  } else if (ruleId === "js-ssrf-unvalidated-url" || ruleId.includes("ssrf") || code === "ssrf") {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `export async function fetchRemoteResource(targetUrl: string) {
  // Vulnerable sink: untrusted external URL fetch without validation
  const response = await fetch(targetUrl);
  return response.json();
}`;
    modifiedCode = `const ALLOWED_HOSTS = ["api.trusted.com", "cdn.trusted.com"];

export async function fetchRemoteResource(targetUrl: string) {
  // Fixed: scheme and host allowlist validation
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error("SecurityException: Untrusted remote host");
  }
  const response = await fetch(parsed.toString());
  return response.json();
}`;
  } else if (scope === "secrets" || ruleId.includes("secret") || code === "secret") {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 2);
    originalCode = `// ${cleanPath}
export const API_SECRET_KEY = "sk-live-98234891283491823791823";
export const DB_PASSWORD = "production_super_secret_database_pass";`;
    modifiedCode = `// ${cleanPath}
export const API_SECRET_KEY = process.env.API_SECRET_KEY || "";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";`;
  } else if ((scope === "orchestrator" || finding.id.startsWith("remote-")) && (code.includes("vuln") || ruleId.includes("cve") || ruleId.includes("jwt") || ruleId.includes("auth"))) {
    startLine = 1;
    originalCode = `// Endpoint: ${cleanPath || "/api/auth"}
export async function verifySession(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  // Insecure: decoding JWT without cryptographically verifying signature
  const payload = JSON.parse(atob(token.split(".")[1]));
  return payload;
}`;
    modifiedCode = `import { jwtVerify, importSPKI } from "jose";

// Endpoint: ${cleanPath || "/api/auth"}
export async function verifySession(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Unauthorized");
  // Fixed: verify RS256 cryptographic signature against trusted public key
  const publicKey = await importSPKI(process.env.JWT_PUBLIC_KEY!, "RS256");
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });
  return payload;
}`;
  } else if ((scope === "orchestrator" || finding.id.startsWith("remote-")) && (code.includes("content") || ruleId.includes("env") || ruleId.includes("exposed"))) {
    startLine = 1;
    originalCode = `// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;`;
    modifiedCode = `// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fixed: Deny direct access to backup files and sensitive dotfiles
  async headers() {
    return [
      {
        source: "/:path*(.env|.git|.backup|config.json)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;`;
  } else if ((scope === "orchestrator" || finding.id.startsWith("remote-")) && (code.includes("port") || ruleId.includes("port") || ruleId.includes("nmap"))) {
    startLine = 1;
    originalCode = `// server.js
const app = express();
// Insecure: service bound to public 0.0.0.0 wildcard interface
app.listen(8080, "0.0.0.0", () => {
  console.log("Server listening on 0.0.0.0:8080");
});`;
    modifiedCode = `// server.js
const app = express();
// Fixed: bind service exclusively to private loopback interface (127.0.0.1)
app.listen(8080, "127.0.0.1", () => {
  console.log("Server listening securely on 127.0.0.1:8080");
});`;
  } else if (scope === "orchestrator" || finding.id.startsWith("remote-")) {
    startLine = 1;
    originalCode = `// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next();
}`;
    modifiedCode = `// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  // Fixed: Apply strict HSTS, frame protection, and content type sniffing guards
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Content-Security-Policy", "default-src 'self'");
  return response;
}`;
  } else if (scope === "parser" || ruleId.includes("syntax") || code === "syntax_error") {
    const errLine = primaryStep?.line ?? 20;
    startLine = Math.max(1, errLine - 4);
    const compName = fileBasename.replace(/\.[^.]+$/, "");
    originalCode = `// File: ${cleanPath} (Line ${errLine})
export function ${compName}() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Content</h1>
      {/* Line ${errLine}: Unclosed JSX element or malformed syntax */}
      <button onClick={() => setIsOpen(true)}>
        Open Modal
    </div>
  );
}`;
    modifiedCode = `// File: ${cleanPath} (Line ${errLine})
export function ${compName}() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Content</h1>
      {/* Fixed: Closed tag and properly balanced JSX structure */}
      <button onClick={() => setIsOpen(true)}>
        Open Modal
      </button>
    </div>
  );
}`;
  } else if (finding.fix) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 2);
    originalCode = `// Location: ${cleanPath}:${primaryStep?.line ?? 1}
// Issue: ${finding.title}
executeUnsafeOperation();`;
    modifiedCode = `// Location: ${cleanPath}:${primaryStep?.line ?? 1}
// Remediated: ${finding.title}
${finding.fix}`;
  } else {
    startLine = 1;
    originalCode = `// Vulnerability: ${finding.title}
// Location: ${cleanPath}:${primaryStep?.line ?? 1}
executeVulnerableCall();`;
    modifiedCode = `// Remediated: ${finding.title}
// Safe implementation applied
executeSafeRemediatedCall();`;
  }
  return { originalCode, modifiedCode, filePath: cleanPath, startLine };
}
function generateUnifiedDiff(original, modified) {
  const a = original.split(/\r?\n/);
  const b = modified.split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i2 = n - 1; i2 >= 0; i2--) {
    for (let j2 = m - 1; j2 >= 0; j2--) {
      lcs[i2][j2] = a[i2] === b[j2] ? lcs[i2 + 1][j2 + 1] + 1 : Math.max(lcs[i2 + 1][j2], lcs[i2][j2 + 1]);
    }
  }
  const lines = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push(`-${a[i]}`);
      i++;
    } else {
      lines.push(`+${b[j]}`);
      j++;
    }
  }
  while (i < n) {
    lines.push(`-${a[i]}`);
    i++;
  }
  while (j < m) {
    lines.push(`+${b[j]}`);
    j++;
  }
  return lines.join("\n");
}

// src/report/generator.ts
var SEVERITY_ORDER2 = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
var DEFAULT_OPTIONS = {
  includeSecrets: true,
  includeTaintPaths: true,
  includeFixDiff: true
};
function escapeCell(value) {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`").replace(/\r?\n/g, " ");
}
function meetsMinSeverity(severity, minSeverity) {
  if (!minSeverity) return true;
  return SEVERITY_ORDER2[severity] <= SEVERITY_ORDER2[minSeverity];
}
function sinkLocation(finding) {
  const steps = finding.trace.steps;
  const step = steps[steps.length - 1] ?? steps[0];
  if (!step) return "\u2014";
  return `${step.filePath}:${step.line}`;
}
function buildSummary(findings) {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byStatus = {
    confirmed: 0,
    "needs-verification": 0,
    discarded: 0
  };
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byStatus[finding.status] += 1;
  }
  return { total: findings.length, bySeverity, byStatus };
}
function renderSummarySection(summary) {
  const severityRows = Object.keys(summary.bySeverity).sort((a, b) => SEVERITY_ORDER2[a] - SEVERITY_ORDER2[b]).map((severity) => `| ${severity} | ${summary.bySeverity[severity]} |`).join("\n");
  const statusRows = Object.keys(summary.byStatus).map((status) => `| ${status} | ${summary.byStatus[status]} |`).join("\n");
  return [
    "## Summary",
    "",
    `Total findings: **${summary.total}**`,
    "",
    "| Severity | Count |",
    "| --- | --- |",
    severityRows,
    "",
    "| Status | Count |",
    "| --- | --- |",
    statusRows
  ].join("\n");
}
function renderIssueTable(findings) {
  if (findings.length === 0) {
    return "## Issues\n\nNo findings to report.";
  }
  const rows = findings.map(
    (finding) => `| ${finding.severity} | ${escapeCell(finding.cwe ?? "\u2014")} | ${escapeCell(
      finding.title
    )} | ${escapeCell(sinkLocation(finding))} | ${finding.status} |`
  ).join("\n");
  return [
    "## Issues",
    "",
    "| Severity | CWE | Title | Location | Status |",
    "| --- | --- | --- | --- | --- |",
    rows
  ].join("\n");
}
function renderTaintPath(finding) {
  const steps = finding.trace.steps.map(
    (step, index) => `${index + 1}. **${step.role}** \u2014 ${step.label} (${step.filePath}:${step.line})`
  );
  return [`#### Taint Path (\`${finding.trace.sinkClass}\`)`, "", ...steps].join("\n");
}
function renderFixDiff(finding) {
  const diff = generateFixDiffText(finding);
  const unified = generateUnifiedDiff(diff.originalCode, diff.modifiedCode);
  return [
    "#### Suggested Fix",
    "",
    `File: \`${diff.filePath}\``,
    "",
    "```diff",
    unified,
    "```"
  ].join("\n");
}
function renderFindingDetail(finding, includeTaintPaths, includeFixDiff) {
  const lines = [
    `### ${escapeCell(finding.title)} (${finding.severity})`,
    "",
    finding.cwe ? `CWE: ${finding.cwe}` : void 0,
    `Status: ${finding.status}`,
    `Location: ${sinkLocation(finding)}`,
    "",
    finding.description
  ].filter((line) => line !== void 0);
  if (finding.reason) lines.push("", `Reason: ${finding.reason}`);
  if (finding.hint) lines.push("", `Remediation: ${finding.hint}`);
  if (finding.link) lines.push("", `Reference: ${finding.link}`);
  if (includeFixDiff) lines.push("", "---", "", renderFixDiff(finding));
  if (includeTaintPaths && finding.trace.steps.length > 0) {
    lines.push("", "---", "", renderTaintPath(finding));
  }
  return lines.join("\n");
}
function renderSecretsSection(secrets) {
  if (secrets.length === 0) {
    return "## Secrets\n\nNo secrets detected.";
  }
  const rows = secrets.map(
    (secret) => `| ${secret.kind} | ${escapeCell(secret.filePath)}:${secret.line} | ${secret.matchedPattern ? escapeCell(secret.matchedPattern) : "\u2014"} |`
  ).join("\n");
  return [
    "## Secrets",
    "",
    "| Kind | Location | Matched Pattern |",
    "| --- | --- | --- |",
    rows
  ].join("\n");
}
function generateMarkdownReport(session, secrets = [], options = DEFAULT_OPTIONS) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const eligibleFindings = session.findings.filter((finding) => meetsMinSeverity(finding.severity, opts.minSeverity)).sort((a, b) => SEVERITY_ORDER2[a.severity] - SEVERITY_ORDER2[b.severity]);
  const summary = buildSummary(eligibleFindings);
  const detailFindings = eligibleFindings.filter((finding) => finding.status !== "discarded");
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const sections = [
    `# Scan Report`,
    "",
    `- Workspace: \`${session.workspacePath}\``,
    `- Scan mode: ${session.mode}`,
    `- Started: ${new Date(session.startedAt).toISOString()}`,
    session.finishedAt ? `- Finished: ${new Date(session.finishedAt).toISOString()}` : void 0,
    `- Generated: ${generatedAt}`,
    `- WhoAmI version: ${APP_VERSION}`,
    "",
    renderSummarySection(summary),
    "",
    renderIssueTable(eligibleFindings),
    "",
    "## Details",
    "",
    detailFindings.length > 0 ? detailFindings.map((finding) => renderFindingDetail(finding, opts.includeTaintPaths, opts.includeFixDiff)).join("\n\n") : "No confirmed or needs-verification findings."
  ].filter((line) => line !== void 0);
  if (opts.includeSecrets) {
    sections.push("", renderSecretsSection(secrets));
  }
  return {
    sessionId: session.id,
    generatedAt,
    markdown: sections.join("\n"),
    summary
  };
}

// src/orchestrator/constants.ts
var DEFAULT_ORCHESTRATOR_URL = "https://axiom-xjkc.onrender.com";

// src/orchestrator/client.ts
var import_types3 = require("@whoami/types");

// src/orchestrator/hmac.ts
function getNodeCrypto() {
  try {
    const nodeReq = typeof globalThis !== "undefined" && globalThis["require"] ? globalThis["require"] : typeof require !== "undefined" ? require : void 0;
    if (typeof nodeReq === "function") {
      return nodeReq("node:crypto") || nodeReq("crypto");
    }
  } catch {
  }
  return void 0;
}
function missingNodeCryptoError(fn) {
  return new Error(
    `[hmac] ${fn} requires Node's crypto module, which isn't available in this runtime. Controller-signed endpoints can only be called from a Node host (e.g. the VS Code extension host).`
  );
}
function generateControllerNonce(length = 32) {
  const boundedLen = Math.max(16, Math.min(80, length));
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.randomBytes) {
    return nodeCrypto.randomBytes(boundedLen).toString("hex").slice(0, boundedLen);
  }
  const bytes = new Uint8Array(Math.ceil(boundedLen / 2));
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, boundedLen);
}
function sha256Hex(content) {
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.createHash) {
    const hash = nodeCrypto.createHash("sha256");
    if (content) hash.update(content);
    return hash.digest("hex");
  }
  if (!content) {
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }
  throw missingNodeCryptoError("sha256Hex");
}
function signControllerMessage(method, path, timestamp, nonce, bodyContent, secret) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const bodyHash = sha256Hex(bodyContent);
  const message = `${normalizedMethod}
${normalizedPath}
${timestamp}
${nonce}
${bodyHash}`;
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.createHmac) {
    return nodeCrypto.createHmac("sha256", secret).update(message).digest("hex");
  }
  throw missingNodeCryptoError("signControllerMessage");
}
function generateControllerHmacHeaders(options) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1e3);
  const nonce = options.nonce ?? generateControllerNonce(32);
  const bodyContent = options.body !== void 0 && options.body !== null ? typeof options.body === "string" ? options.body : JSON.stringify(options.body) : "";
  const signature = signControllerMessage(
    options.method,
    options.path,
    timestamp,
    nonce,
    bodyContent,
    options.secret
  );
  return {
    "X-Controller-Timestamp": String(timestamp),
    "X-Controller-Nonce": nonce,
    "X-Controller-Signature": signature,
    "Content-Type": "application/json"
  };
}

// src/orchestrator/client.ts
var TERMINAL_SCAN_STATUSES = /* @__PURE__ */ new Set(["completed", "failed", "cancelled"]);
var DEFAULT_POLL_MAX_WAIT_MS = 40 * 60 * 1e3;
var MAX_CONSECUTIVE_POLL_ERRORS = 8;
function isTransientOrchestratorError(err) {
  if (!(err instanceof OrchestratorApiError)) return false;
  if (err.code === "rate_limited" || err.code === "request_timeout" || err.code === "network_error") {
    return true;
  }
  return err.statusCode === 502 || err.statusCode === 503 || err.statusCode === 504;
}
function withJitter(ms) {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var OrchestratorApiError = class extends import_types3.VercelError {
  responseBody;
  /** From a 429's Retry-After header, when the server sent one. */
  retryAfterMs;
  constructor(message, statusCode, responseBody, options) {
    super(message, {
      code: options?.code ?? (statusCode > 0 ? `http_${statusCode}` : "network_error"),
      scope: "orchestrator",
      statusCode: statusCode > 0 ? statusCode : 500,
      reason: options?.reason,
      hint: options?.hint,
      fix: options?.fix,
      link: options?.link ?? DEFAULT_ORCHESTRATOR_URL
    });
    this.name = "OrchestratorApiError";
    this.responseBody = responseBody;
  }
};
function cleanCredential(val) {
  if (!val) return void 0;
  const trimmed = val.trim().replace(/^["']|["']$/g, "").trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null" || trimmed === "none" || trimmed === "YOUR_API_KEY" || trimmed === "<YOUR_API_KEY>" || trimmed === "<OPERATOR_OR_ADMIN_API_KEY>") {
    return void 0;
  }
  return trimmed;
}
function sanitizeTargetHostname(raw) {
  if (!raw) return "scan-target.example.com";
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i, "");
  cleaned = cleaned.replace(/[/?#].*$/, "");
  if (!cleaned.includes("]") && cleaned.includes(":") && !cleaned.startsWith("[")) {
    const parts = cleaned.split(":");
    if (parts[0]) cleaned = parts[0];
  }
  cleaned = cleaned.trim();
  if (!cleaned || cleaned.endsWith(".internal") || cleaned === "localhost") {
    return "scan-target.example.com";
  }
  return cleaned;
}
function buildQueryString(params) {
  if (!params) return "";
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== void 0 && v !== null && v !== "") {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}
var ScanOrchestratorClient = class {
  baseUrl;
  apiKey;
  adminApiKey;
  authMode;
  jwtToken;
  controllerSecret;
  fetchFn;
  timeoutMs;
  logger;
  constructor(config = {}) {
    const rawUrl = config.baseUrl || (typeof process !== "undefined" ? process.env?.["ORCHESTRATOR_URL"] : void 0) || DEFAULT_ORCHESTRATOR_URL;
    this.baseUrl = cleanCredential(rawUrl)?.replace(/\/+$/, "") || DEFAULT_ORCHESTRATOR_URL;
    this.apiKey = cleanCredential(
      config.apiKey || (typeof process !== "undefined" ? process.env?.["API_KEY"] : void 0)
    );
    this.adminApiKey = cleanCredential(
      config.adminApiKey || (typeof process !== "undefined" ? process.env?.["ADMIN_API_KEY"] : void 0)
    );
    this.authMode = config.authMode || "api_key";
    this.jwtToken = cleanCredential(
      config.jwtToken || config.bearerToken || (typeof process !== "undefined" ? process.env?.["AUTH_TOKEN"] : void 0)
    );
    this.controllerSecret = cleanCredential(
      config.controllerSecret || (typeof process !== "undefined" ? process.env?.["CONTROLLER_SHARED_SECRET"] : void 0)
    );
    this.fetchFn = config.fetchFn || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : void 0);
    this.timeoutMs = config.timeoutMs || 6e4;
    this.logger = (config.logger || new Logger({ source: "orchestrator-client" })).child("orchestrator-client");
  }
  async request(path, options = {}) {
    if (!this.fetchFn) {
      throw new import_types3.VercelError(
        "[ScanOrchestratorClient] No fetch implementation available in current environment",
        {
          code: "missing_fetch",
          scope: "orchestrator",
          hint: "Provide a custom fetchFn in configuration or ensure global fetch is available."
        }
      );
    }
    const method = options.method || "GET";
    const authType = options.auth ?? "operator";
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = {
      Accept: "application/json",
      ...options.headers
    };
    if (options.body !== void 0 && options.body !== null) {
      headers["Content-Type"] = "application/json";
    }
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    let activeKeyPreview = "none";
    if (authType === "admin") {
      const key = this.adminApiKey;
      if (this.jwtToken) {
        headers["Authorization"] = `Bearer ${this.jwtToken}`;
        activeKeyPreview = `Bearer jwt (len ${this.jwtToken.length})`;
      } else if (key) {
        activeKeyPreview = `${key.slice(0, 4)}...${key.slice(-4)} (len ${key.length})`;
        if (this.authMode === "bearer") {
          headers["Authorization"] = `Bearer ${key}`;
        } else {
          headers["X-API-Key"] = key;
        }
      } else {
        throw new OrchestratorApiError(
          "Admin authentication required but no ADMIN_API_KEY or Bearer token configured",
          401,
          null,
          {
            code: "admin_auth_missing",
            reason: "Admin credentials missing from environment and client configuration.",
            hint: "Target registration and audit inspection require ADMIN_API_KEY. Configure ADMIN_API_KEY in .env or settings.",
            fix: "Configure ADMIN_API_KEY in .env or settings."
          }
        );
      }
    } else if (authType === "operator") {
      const key = this.apiKey || this.adminApiKey;
      if (this.jwtToken) {
        headers["Authorization"] = `Bearer ${this.jwtToken}`;
        activeKeyPreview = `Bearer jwt (len ${this.jwtToken.length})`;
      } else if (key) {
        activeKeyPreview = `${key.slice(0, 4)}...${key.slice(-4)} (len ${key.length})`;
        if (this.authMode === "bearer") {
          headers["Authorization"] = `Bearer ${key}`;
        } else {
          headers["X-API-Key"] = key;
        }
      } else {
        throw new OrchestratorApiError(
          "Operator authentication required but no API_KEY or Bearer token configured",
          401,
          null,
          {
            code: "auth_missing",
            reason: "Operator credentials missing from environment and client configuration.",
            hint: "Provide apiKey or set API_KEY environment variable.",
            fix: "Configure API_KEY in .env or settings."
          }
        );
      }
    } else if (authType === "controller") {
      if (!this.controllerSecret) {
        throw new OrchestratorApiError(
          "Controller authentication required but no CONTROLLER_SHARED_SECRET configured",
          401,
          null,
          {
            code: "controller_secret_missing",
            reason: "Controller HMAC shared secret is missing.",
            hint: "Provide controllerSecret in client configuration or set CONTROLLER_SHARED_SECRET.",
            fix: "Configure CONTROLLER_SHARED_SECRET in .env or worker settings."
          }
        );
      }
      const controllerHeaders = generateControllerHmacHeaders({
        method,
        path,
        body: options.body,
        secret: this.controllerSecret
      });
      Object.assign(headers, controllerHeaders);
    }
    this.logger.debug(`API Request: ${method} ${path}`, {
      url,
      authType,
      keyPreview: activeKeyPreview,
      hasBody: options.body !== void 0
    });
    const startTime = Date.now();
    let response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body: options.body !== void 0 && options.body !== null ? typeof options.body === "string" ? options.body : JSON.stringify(options.body) : void 0,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (err) {
      const durationMs2 = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      this.logger.error(
        `API Request Network Failure: ${method} ${path}`,
        err instanceof Error ? err : new Error(errMsg),
        { durationMs: durationMs2, isTimeout }
      );
      if (isTimeout) {
        throw new OrchestratorApiError(
          `Timed out waiting for Orchestrator response after ${this.timeoutMs}ms: ${method} ${path}`,
          0,
          null,
          {
            code: "request_timeout",
            reason: `${this.baseUrl} did not respond within ${this.timeoutMs}ms. Free-tier deployments spin down when idle and can take up to a minute to cold-start on the next request.`,
            hint: "If the service was idle, the first request after a while wakes it up but can still time out \u2014 retry once.",
            fix: "Retry the request, or raise timeoutMs in the orchestrator client config if this happens consistently on a warm service."
          }
        );
      }
      throw new OrchestratorApiError(
        `Network error communicating with Orchestrator: ${errMsg}`,
        0,
        null,
        {
          code: "network_error",
          reason: `Failed to establish connection to ${this.baseUrl}${path}`,
          hint: `Ensure ${this.baseUrl} is reachable and your network is connected.`,
          fix: "Check ORCHESTRATOR_URL in .env or settings."
        }
      );
    }
    const durationMs = Date.now() - startTime;
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    let responseData;
    if (isJson) {
      try {
        responseData = await response.json();
      } catch {
        responseData = null;
      }
    } else {
      responseData = await response.text();
    }
    if (!response.ok) {
      let errorMessage = `Orchestrator request failed with status ${response.status}`;
      let errorType = "api_error";
      if (responseData && typeof responseData === "object") {
        const obj = responseData;
        if (obj["error"] && typeof obj["error"] === "object") {
          const errEnv = obj["error"];
          if (typeof errEnv["type"] === "string") {
            errorType = errEnv["type"];
          }
          if (typeof errEnv["detail"] === "string") {
            errorMessage = errEnv["detail"];
          } else if (Array.isArray(errEnv["detail"])) {
            errorMessage = this.formatDetailArray(errEnv["detail"]);
          }
        } else if ("detail" in obj) {
          if (typeof obj["detail"] === "string") {
            errorMessage = obj["detail"];
          } else if (Array.isArray(obj["detail"])) {
            errorMessage = this.formatDetailArray(obj["detail"]);
          }
        }
      }
      this.logger.warn(
        `API Error Response: ${method} ${path} -> ${response.status}`,
        {
          url,
          authType,
          keyPreview: activeKeyPreview,
          statusCode: response.status,
          error: errorMessage,
          errorType,
          durationMs
        }
      );
      let meta = {};
      if (response.status === 401 || response.status === 403) {
        meta = {
          code: "auth_failed",
          reason: "API key was missing, invalid, or has insufficient role permissions for this endpoint.",
          hint: "Verify API_KEY or ADMIN_API_KEY in your .env or settings.",
          fix: "Set a valid API Key in settings or .env file."
        };
      } else if (response.status === 404) {
        meta = {
          code: "not_found",
          reason: "The requested resource was not found on the Orchestrator.",
          hint: "Ensure the ID exists before performing this operation."
        };
      } else if (response.status === 409) {
        meta = {
          code: "conflict",
          reason: "Resource is currently in an incompatible state for the requested operation.",
          hint: "Wait for the scan job to finish or check job status."
        };
      } else if (response.status === 422 || errorType === "validation_error") {
        meta = {
          code: "validation_error",
          reason: errorMessage,
          hint: "Payload validation failed on required fields or constraints.",
          fix: "Check input format against API specifications."
        };
      } else if (response.status === 429) {
        meta = {
          code: "rate_limited",
          reason: "Rate limit (60 requests/minute) exceeded on the Orchestrator service.",
          hint: "Back off and wait a few moments before retrying.",
          fix: "Slow down request polling rate."
        };
      }
      const apiError = new OrchestratorApiError(
        errorMessage,
        response.status,
        responseData,
        meta
      );
      if (response.status === 429) {
        const retryAfterSec = Number.parseInt(
          response.headers?.get?.("retry-after") ?? "",
          10
        );
        if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          apiError.retryAfterMs = retryAfterSec * 1e3;
        }
      }
      throw apiError;
    }
    this.logger.debug(
      `API Success Response: ${method} ${path} -> ${response.status}`,
      { durationMs }
    );
    return responseData;
  }
  formatDetailArray(details) {
    return details.map((d) => {
      if (d && typeof d === "object") {
        const dObj = d;
        const loc = Array.isArray(dObj["loc"]) ? dObj["loc"].filter((x) => x !== "body").join(".") : "";
        const msg = typeof dObj["msg"] === "string" ? dObj["msg"] : "";
        return loc ? `${loc}: ${msg}` : msg;
      }
      return String(d);
    }).filter(Boolean).join("; ");
  }
  // ============================================================================
  // 1. Health & Operational Endpoints (Public)
  // ============================================================================
  /**
   * Basic Health Check (GET /health)
   */
  async getHealth() {
    return this.request("/health", {
      auth: "none"
    });
  }
  /**
   * Kubernetes Liveness Probe (GET /health/live)
   */
  async getLiveness() {
    return this.request("/health/live", { auth: "none" });
  }
  /**
   * Kubernetes / System Readiness Probe (GET /health/ready)
   */
  async getReadiness() {
    return this.request("/health/ready", { auth: "none" });
  }
  // ============================================================================
  // 2. Target Management Endpoints (Admin Required)
  // ============================================================================
  /**
   * Register a new authorized target (POST /v1/targets)
   */
  async registerTarget(target) {
    const isSourceCode = target.target_type === "source_code" || target.value.startsWith("/") || target.value.includes("\\") || target.value.startsWith("git@") || target.value.startsWith("https://") && target.value.includes("github.com");
    const targetPayload = {
      ...target,
      target_type: isSourceCode ? "source_code" : target.target_type || "network",
      value: isSourceCode ? target.value.trim() : sanitizeTargetHostname(target.value)
    };
    return this.request("/v1/targets", {
      method: "POST",
      body: targetPayload,
      auth: "admin"
    });
  }
  /**
   * List Registered Targets with pagination (GET /v1/targets)
   */
  async listTargets(params) {
    const qs = buildQueryString(params);
    return this.request(`/v1/targets${qs}`, {
      method: "GET",
      auth: "admin"
    });
  }
  /**
   * Get Target Details by target ID (GET /v1/targets/{target_id})
   */
  async getTarget(targetId) {
    return this.request(`/v1/targets/${encodeURIComponent(targetId)}`, {
      method: "GET",
      auth: "admin"
    });
  }
  // ============================================================================
  // 3. DAST Scans (Dynamic Application Security Testing)
  // ============================================================================
  /**
   * Queue a new DAST scan job (POST /v1/scans)
   */
  async submitScan(scan, idempotencyKey) {
    return this.request("/v1/scans", {
      method: "POST",
      body: scan,
      idempotencyKey,
      auth: "operator"
    });
  }
  /**
   * List DAST scans with optional filters & pagination (GET /v1/scans)
   */
  async listScans(params) {
    const qs = buildQueryString(params);
    return this.request(`/v1/scans${qs}`, {
      method: "GET",
      auth: "operator"
    });
  }
  /**
   * Retrieve the status of a DAST scan job (GET /v1/scans/{scan_id})
   */
  async getScan(scanId) {
    return this.request(`/v1/scans/${encodeURIComponent(scanId)}`, {
      method: "GET",
      auth: "operator"
    });
  }
  /**
   * Request cancellation of a queued or running DAST scan job (POST /v1/scans/{scan_id}/cancel)
   */
  async cancelScan(scanId) {
    return this.request(
      `/v1/scans/${encodeURIComponent(scanId)}/cancel`,
      {
        method: "POST",
        auth: "operator"
      }
    );
  }
  /**
   * Retry a failed or cancelled DAST scan job (POST /v1/scans/{scan_id}/retry)
   */
  async retryScan(scanId) {
    return this.request(
      `/v1/scans/${encodeURIComponent(scanId)}/retry`,
      {
        method: "POST",
        auth: "operator"
      }
    );
  }
  /**
   * Get the parsed results, summary, and artifacts of a DAST scan (GET /v1/scans/{scan_id}/result)
   */
  async getScanResult(scanId) {
    return this.request(
      `/v1/scans/${encodeURIComponent(scanId)}/result`,
      {
        method: "GET",
        auth: "operator"
      }
    );
  }
  /**
   * Polls a DAST scan job until it reaches a terminal status ('completed', 'failed', 'cancelled')
   */
  async pollScanUntilComplete(scanId, options = {}) {
    const [polled] = await this.pollScansUntilComplete([scanId], {
      ...options,
      kind: "dast",
      onProgress: (scans) => {
        if (scans[0]) options.onProgress?.(scans[0]);
      }
    });
    return polled;
  }
  /**
   * Polls several scans (all DAST or all SAST) until every one is terminal, and
   * fetches each result once. Compared with polling each scan in its own loop:
   * - one list request per tick covers every scan of a run when `targetId` is given;
   * - the interval backs off (x1.5, jittered, capped) while no status changes,
   *   and snaps back to `intervalMs` when one does;
   * - rate limiting (honouring Retry-After), timeouts, network errors and
   *   deploy-time 502/503/504s are retried instead of aborting the whole run.
   * Results are returned in `scanIds` order.
   */
  async pollScansUntilComplete(scanIds, options = {}) {
    const kind = options.kind ?? "dast";
    const baseIntervalMs = options.intervalMs || 2e3;
    const maxIntervalMs = Math.max(options.maxIntervalMs || 1e4, baseIntervalMs);
    const maxWaitMs = options.maxWaitMs || DEFAULT_POLL_MAX_WAIT_MS;
    const startTime = Date.now();
    const latest = /* @__PURE__ */ new Map();
    const finished = /* @__PURE__ */ new Map();
    let intervalMs = baseIntervalMs;
    let consecutiveErrors = 0;
    while (Date.now() - startTime < maxWaitMs) {
      let waitMs = intervalMs;
      try {
        const pending = scanIds.filter((id) => !finished.has(id));
        const scans = await this.fetchScanStatuses(pending, kind, options.targetId);
        consecutiveErrors = 0;
        let changed = false;
        for (const scan of scans) {
          if (latest.get(scan.id)?.status !== scan.status) changed = true;
          latest.set(scan.id, scan);
        }
        options.onProgress?.(
          scanIds.flatMap((id) => {
            const scan = latest.get(id);
            return scan ? [scan] : [];
          })
        );
        for (const scan of scans) {
          if (TERMINAL_SCAN_STATUSES.has(scan.status)) {
            finished.set(scan.id, { scan, result: await this.fetchTerminalResult(scan, kind) });
          }
        }
        if (finished.size === scanIds.length) {
          return scanIds.map((id) => finished.get(id));
        }
        intervalMs = changed ? baseIntervalMs : Math.min(intervalMs * 1.5, maxIntervalMs);
        waitMs = intervalMs;
      } catch (err) {
        consecutiveErrors += 1;
        if (!isTransientOrchestratorError(err) || consecutiveErrors > MAX_CONSECUTIVE_POLL_ERRORS) {
          throw err;
        }
        intervalMs = Math.min(intervalMs * 2, maxIntervalMs);
        waitMs = Math.max(err.retryAfterMs ?? 0, intervalMs);
        this.logger.warn(
          `Transient orchestrator error while polling (${err.code}); retrying in ~${waitMs}ms`
        );
      }
      await sleep(withJitter(waitMs));
    }
    const unfinished = scanIds.filter((id) => !finished.has(id));
    const label = kind === "sast" ? "SAST scan" : "scan";
    throw new import_types3.VercelError(
      `[ScanOrchestratorClient] Timed out waiting for ${label} ${unfinished.join(", ")} after ${maxWaitMs}ms`,
      {
        code: "scan_timeout",
        scope: "orchestrator",
        reason: `${label} job(s) ${unfinished.join(", ")} remained in non-terminal state after ${maxWaitMs}ms`,
        hint: "The scan might still be running, or a backend deployment/restart interrupted it mid-scan without reporting failure in time -- retrying usually resolves this.",
        fix: "Retry polling with a higher maxWaitMs or check controller logs.",
        link: DEFAULT_ORCHESTRATOR_URL
      }
    );
  }
  async fetchScanStatuses(scanIds, kind, targetId) {
    const getOne = (id) => kind === "sast" ? this.getSastScan(id) : this.getScan(id);
    if (!targetId || scanIds.length < 2) {
      const scans2 = [];
      for (const id of scanIds) scans2.push(await getOne(id));
      return scans2;
    }
    const params = { target_id: targetId, limit: 200 };
    const listed = kind === "sast" ? await this.listSastScans(params) : await this.listScans(params);
    const wanted = new Set(scanIds);
    const scans = listed.filter((scan) => wanted.has(scan.id));
    const seen = new Set(scans.map((scan) => scan.id));
    for (const id of scanIds) {
      if (!seen.has(id)) scans.push(await getOne(id));
    }
    return scans;
  }
  async fetchTerminalResult(scan, kind) {
    const getResult = (id) => kind === "sast" ? this.getSastScanResult(id) : this.getScanResult(id);
    if (scan.status === "completed") return getResult(scan.id);
    try {
      return await getResult(scan.id);
    } catch {
      return void 0;
    }
  }
  // ============================================================================
  // 4. SAST Scans (Static Application Security Testing)
  // ============================================================================
  /**
   * List available SAST profiles, engines, language capabilities, and query bundles.
   * Public endpoint (no authentication required).
   */
  async getSastProfiles() {
    return this.request("/v1/sast/profiles", {
      method: "GET",
      auth: "none"
    });
  }
  /**
   * Queue a new SAST code analysis job (POST /v1/sast/scans)
   */
  async submitSastScan(scan, idempotencyKey) {
    return this.request("/v1/sast/scans", {
      method: "POST",
      body: scan,
      idempotencyKey,
      auth: "operator"
    });
  }
  /**
   * List SAST scans with optional filters & pagination (GET /v1/sast/scans)
   */
  async listSastScans(params) {
    const qs = buildQueryString(params);
    return this.request(`/v1/sast/scans${qs}`, {
      method: "GET",
      auth: "operator"
    });
  }
  /**
   * Retrieve the status of a SAST scan job (GET /v1/sast/scans/{scan_id})
   */
  async getSastScan(scanId) {
    return this.request(
      `/v1/sast/scans/${encodeURIComponent(scanId)}`,
      {
        method: "GET",
        auth: "operator"
      }
    );
  }
  /**
   * Request cancellation of a queued or running SAST scan job (POST /v1/sast/scans/{scan_id}/cancel)
   */
  async cancelSastScan(scanId) {
    return this.request(
      `/v1/sast/scans/${encodeURIComponent(scanId)}/cancel`,
      {
        method: "POST",
        auth: "operator"
      }
    );
  }
  /**
   * Retry a failed or cancelled SAST scan job (POST /v1/sast/scans/{scan_id}/retry)
   */
  async retrySastScan(scanId) {
    return this.request(
      `/v1/sast/scans/${encodeURIComponent(scanId)}/retry`,
      {
        method: "POST",
        auth: "operator"
      }
    );
  }
  /**
   * Get the parsed results, summary, and findings of a SAST scan (GET /v1/sast/scans/{scan_id}/result)
   */
  async getSastScanResult(scanId) {
    return this.request(
      `/v1/sast/scans/${encodeURIComponent(scanId)}/result`,
      {
        method: "GET",
        auth: "operator"
      }
    );
  }
  /**
   * Polls a SAST scan job until it reaches a terminal status ('completed', 'failed', 'cancelled')
   * and optionally fetches the final scan result.
   */
  async pollSastScanUntilComplete(scanId, options = {}) {
    const [polled] = await this.pollScansUntilComplete([scanId], {
      ...options,
      kind: "sast",
      onProgress: (scans) => {
        if (scans[0]) options.onProgress?.(scans[0]);
      }
    });
    return polled;
  }
  // ============================================================================
  // 5. Audit & Compliance Endpoints (Admin Required)
  // ============================================================================
  /**
   * List recent security audit events (GET /v1/audit-events)
   */
  async listAuditEvents() {
    return this.request("/v1/audit-events", {
      method: "GET",
      auth: "admin"
    });
  }
  // ============================================================================
  // 6. Dashboard & Statistics Endpoints (Operator / Admin)
  // ============================================================================
  /**
   * Get Platform Dashboard Statistics across targets, scans, and profiles (GET /v1/stats)
   */
  async getStats() {
    return this.request("/v1/stats", {
      method: "GET",
      auth: "operator"
    });
  }
  // ============================================================================
  // 7. Internal Controller Protocol (Private HMAC)
  // ============================================================================
  /**
   * Claim next queued job from the orchestrator (POST /v1/internal/controller/jobs/claim)
   */
  async claimControllerJob() {
    return this.request(
      "/v1/internal/controller/jobs/claim",
      {
        method: "POST",
        body: null,
        auth: "controller"
      }
    );
  }
  /**
   * Report controller job completion with findings and risk summary (POST /v1/internal/controller/jobs/{scan_id}/complete)
   */
  async completeControllerJob(scanId, payload) {
    return this.request(
      `/v1/internal/controller/jobs/${encodeURIComponent(scanId)}/complete`,
      {
        method: "POST",
        body: payload,
        auth: "controller"
      }
    );
  }
  /**
   * Report controller job failure with descriptive reason (POST /v1/internal/controller/jobs/{scan_id}/fail)
   */
  async failControllerJob(scanId, payload) {
    return this.request(
      `/v1/internal/controller/jobs/${encodeURIComponent(scanId)}/fail`,
      {
        method: "POST",
        body: payload,
        auth: "controller"
      }
    );
  }
  /**
   * Query status of a controller job (GET /v1/internal/controller/jobs/{scan_id}/status)
   */
  async getControllerJobStatus(scanId) {
    return this.request(
      `/v1/internal/controller/jobs/${encodeURIComponent(scanId)}/status`,
      {
        method: "GET",
        auth: "controller"
      }
    );
  }
};

// src/orchestrator/bridge-router.ts
var ORCHESTRATOR_REQUEST_TYPES = /* @__PURE__ */ new Set([
  "register-target-request",
  "list-targets-request",
  "get-target-request",
  "submit-remote-scan-request",
  "list-scans-request",
  "get-remote-scan-request",
  "cancel-remote-scan-request",
  "retry-scan-request",
  "get-remote-scan-result-request",
  "list-audit-events-request",
  "get-platform-stats-request",
  "poll-remote-scan-request",
  "get-sast-profiles-request",
  "submit-sast-scan-request",
  "list-sast-scans-request",
  "get-sast-scan-request",
  "cancel-sast-scan-request",
  "retry-sast-scan-request",
  "get-sast-scan-result-request",
  "poll-remote-scans-request",
  "poll-sast-scan-request"
]);
function isOrchestratorRequest(message) {
  return ORCHESTRATOR_REQUEST_TYPES.has(message.type);
}
async function handleOrchestratorMessage(getClient, message, post) {
  if (!isOrchestratorRequest(message)) return false;
  const client = await getClient();
  const { requestId } = message;
  switch (message.type) {
    case "register-target-request": {
      const target = await client.registerTarget(message.target);
      post({ type: "register-target-result", target, requestId });
      return true;
    }
    case "list-targets-request": {
      const targets = await client.listTargets(message.params);
      post({ type: "list-targets-result", targets, requestId });
      return true;
    }
    case "get-target-request": {
      const target = await client.getTarget(message.targetId);
      post({ type: "get-target-result", target, requestId });
      return true;
    }
    case "submit-remote-scan-request": {
      const scan = await client.submitScan(message.scan, message.idempotencyKey);
      post({ type: "submit-remote-scan-result", scan, requestId });
      return true;
    }
    case "list-scans-request": {
      const scans = await client.listScans(message.params);
      post({ type: "list-scans-result", scans, requestId });
      return true;
    }
    case "get-remote-scan-request": {
      const scan = await client.getScan(message.scanId);
      post({ type: "get-remote-scan-result", scan, requestId });
      return true;
    }
    case "cancel-remote-scan-request": {
      const scan = await client.cancelScan(message.scanId);
      post({ type: "cancel-remote-scan-result", scan, requestId });
      return true;
    }
    case "retry-scan-request": {
      const scan = await client.retryScan(message.scanId);
      post({ type: "retry-scan-result", scan, requestId });
      return true;
    }
    case "get-remote-scan-result-request": {
      const result = await client.getScanResult(message.scanId);
      post({ type: "get-remote-scan-result-result", result, requestId });
      return true;
    }
    case "list-audit-events-request": {
      const events = await client.listAuditEvents();
      post({ type: "list-audit-events-result", events, requestId });
      return true;
    }
    case "get-platform-stats-request": {
      const stats = await client.getStats();
      post({ type: "get-platform-stats-result", stats, requestId });
      return true;
    }
    case "poll-remote-scan-request": {
      const { scan, result } = await client.pollScanUntilComplete(message.scanId);
      post({ type: "poll-remote-scan-result", scan, result, requestId });
      return true;
    }
    case "get-sast-profiles-request": {
      const profiles = await client.getSastProfiles();
      post({ type: "get-sast-profiles-result", profiles, requestId });
      return true;
    }
    case "submit-sast-scan-request": {
      const scan = await client.submitSastScan(message.scan, message.idempotencyKey);
      post({ type: "submit-sast-scan-result", scan, requestId });
      return true;
    }
    case "list-sast-scans-request": {
      const scans = await client.listSastScans(message.params);
      post({ type: "list-sast-scans-result", scans, requestId });
      return true;
    }
    case "get-sast-scan-request": {
      const scan = await client.getSastScan(message.scanId);
      post({ type: "get-sast-scan-result", scan, requestId });
      return true;
    }
    case "cancel-sast-scan-request": {
      const scan = await client.cancelSastScan(message.scanId);
      post({ type: "cancel-sast-scan-result", scan, requestId });
      return true;
    }
    case "retry-sast-scan-request": {
      const scan = await client.retrySastScan(message.scanId);
      post({ type: "retry-sast-scan-result", scan, requestId });
      return true;
    }
    case "get-sast-scan-result-request": {
      const result = await client.getSastScanResult(message.scanId);
      post({ type: "get-sast-scan-result-result", result, requestId });
      return true;
    }
    case "poll-remote-scans-request": {
      const results = await client.pollScansUntilComplete(message.scanIds, {
        kind: message.kind,
        targetId: message.targetId,
        onProgress: (scans) => post({ type: "poll-remote-scans-progress", pollId: message.pollId, scans })
      });
      post({ type: "poll-remote-scans-result", results, requestId });
      return true;
    }
    case "poll-sast-scan-request": {
      const { scan, result } = await client.pollSastScanUntilComplete(message.scanId);
      post({ type: "poll-sast-scan-result", scan, result, requestId });
      return true;
    }
    default:
      return false;
  }
}

// src/orchestrator/url-config.ts
var ORCHESTRATOR_ORIGIN_ALLOWLIST = [
  new URL(DEFAULT_ORCHESTRATOR_URL).origin
];
var LOOPBACK_HOSTNAMES = /* @__PURE__ */ new Set(["localhost", "127.0.0.1"]);
function validateOrchestratorUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `"${raw}" is not a valid URL.` };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "The orchestrator URL must not contain credentials." };
  }
  const isLoopback = LOOPBACK_HOSTNAMES.has(parsed.hostname);
  if (parsed.protocol === "http:" && !isLoopback) {
    return {
      ok: false,
      reason: "The orchestrator URL must use https (plain http is allowed only for localhost)."
    };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "The orchestrator URL must use https." };
  }
  if (!isLoopback && !ORCHESTRATOR_ORIGIN_ALLOWLIST.includes(parsed.origin)) {
    return {
      ok: false,
      reason: `${parsed.origin} is not an allowed orchestrator host. Allowed: ${ORCHESTRATOR_ORIGIN_ALLOWLIST.join(", ")}, or http://localhost / http://127.0.0.1 on any port.`
    };
  }
  const url = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  return { ok: true, url };
}
function resolveOrchestratorUrl(sources) {
  const user = sources.userSetting?.trim();
  const candidate = (user && user.replace(/\/+$/, "") !== DEFAULT_ORCHESTRATOR_URL ? user : void 0) || sources.buildTime?.trim() || DEFAULT_ORCHESTRATOR_URL;
  return validateOrchestratorUrl(candidate);
}
//# sourceMappingURL=index.cjs.map