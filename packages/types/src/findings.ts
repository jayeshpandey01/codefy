import type { TaintTrace } from "./taint.js";

/**
 * Tri-state model — never a numeric confidence score. See CLAUDE.md's
 * "Precision & Trust Over Volume" principle and the taint-engine skill.
 */
export type FindingStatus = "confirmed" | "needs-verification" | "discarded";

export type Severity = "critical" | "high" | "medium" | "low";

export type FindingScope =
  | "code"
  | "secrets"
  | "endpoint"
  | "security"
  | "orchestrator"
  | "parser"
  | string;

export interface Finding {
  readonly id: string;
  readonly ruleId: string;
  readonly status: FindingStatus;
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly cwe?: string;
  readonly trace: TaintTrace;
  readonly createdAt: string;

  /** Actual ast-grep YAML rule definition or parser specification in string form */
  readonly ruleYaml?: string;

  /** Diagnostic code (e.g. 'command_injection', 'syntax_error') */
  readonly code?: string;
  /** Diagnostic scope (e.g. 'code', 'secrets', 'endpoint', 'parser') */
  readonly scope?: FindingScope;
  /** Detailed reason explaining why this issue was flagged */
  readonly reason?: string;
  /** Actionable hint explaining how to remediate the issue */
  readonly hint?: string;
  /** Suggested copyable code fix snippet */
  readonly fix?: string;
  /** External documentation, CWE, or advisory link */
  readonly link?: string;
}

export * from "./finding-dedup.js";
