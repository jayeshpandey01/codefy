import type { Severity, SinkClass } from "@whoami/types";

/**
 * Binds one of this package's ast-grep rules (src/rules/*) to the taint
 * pipeline's vocabulary: which SinkClass it represents, and which ast-grep
 * metavariable (see AstGrepMatch.captures) holds the tainted argument that
 * src/taint/propagate.ts must trace back to a source. Metadata here (title/
 * description/severity/cwe) is what src/engine.ts uses to fill in the
 * Finding shape from @whoami/types.
 */
export interface SinkRuleBinding {
  readonly ruleId: string;
  readonly sinkClass: SinkClass;
  /** Name of the ast-grep metavariable (without the leading `$`) holding the tainted argument. */
  readonly taintedCapture: string;
  readonly severity: Severity;
  readonly cwe: string;
  readonly title: string;
  readonly description: string;
}

export const JS_TS_SINK_RULES: readonly SinkRuleBinding[] = [
  {
    ruleId: "js-command-injection-exec",
    sinkClass: "command-injection",
    taintedCapture: "CMD",
    severity: "critical",
    cwe: "CWE-78",
    title: "Command Injection via child_process.exec/execSync",
    description:
      "User-controlled input reaches child_process.exec/execSync with shell interpretation " +
      "enabled. Any shell metacharacter in the tainted input (;, |, &&, $(), backticks) breaks " +
      "out of the intended command.",
  },
  {
    ruleId: "js-sql-injection-string-concat",
    sinkClass: "sql-injection",
    taintedCapture: "QUERY",
    severity: "critical",
    cwe: "CWE-89",
    title: "SQL Injection via string concatenation",
    description:
      "A SQL query is built via string concatenation/template literal interpolation instead of " +
      "parameterized placeholders, letting attacker-controlled input change the query structure.",
  },
  {
    ruleId: "js-ssrf-unvalidated-url",
    sinkClass: "ssrf",
    taintedCapture: "URL",
    severity: "high",
    cwe: "CWE-918",
    title: "Server-Side Request Forgery (SSRF)",
    description:
      "A user-controlled value reaches an outbound HTTP call (fetch/axios/http.request) with no " +
      "visible URL-scheme/host validation on the same path.",
  },
  {
    ruleId: "js-path-traversal",
    sinkClass: "path-traversal",
    taintedCapture: "PATH",
    severity: "high",
    cwe: "CWE-22",
    title: "Path Traversal via filesystem operation",
    description:
      "User-controlled input reaches filesystem read operations without proper path normalization " +
      "and root directory boundary checks.",
  },
  {
    ruleId: "js-code-injection",
    sinkClass: "code-injection",
    taintedCapture: "CODE",
    severity: "critical",
    cwe: "CWE-95",
    title: "Code Injection via dynamic code execution",
    description:
      "User-controlled input reaches eval, Function constructor, or VM execution context, " +
      "allowing arbitrary code execution.",
  },
];

export function getSinkRuleBinding(
  ruleId: string,
): SinkRuleBinding | undefined {
  return JS_TS_SINK_RULES.find((binding) => binding.ruleId === ruleId);
}
