import type { FindingStatus, SinkClass, Severity } from "@whoami/types";

/**
 * Plain Record lookups, not an NLP/embeddings library — see
 * docs/CHAT-QUERY-ENGINE-SPEC.md §B.7. Every key is checked as a substring
 * of the normalized (lowercased) query, longest-first (see
 * matchLongestPhrase in entities.ts) so multi-word phrases like "sql
 * injection" win over any accidental single-word overlap.
 */
export const SEVERITY_SYNONYMS: Record<string, Severity> = {
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
  info: "low",
};

export const STATUS_SYNONYMS: Record<string, FindingStatus> = {
  confirmed: "confirmed",
  verified: "confirmed",
  "needs verification": "needs-verification",
  "needs-verification": "needs-verification",
  unverified: "needs-verification",
  unresolved: "needs-verification",
  discarded: "discarded",
  dismissed: "discarded",
  "false positive": "discarded",
  "false-positive": "discarded",
};

export const SINK_CLASS_SYNONYMS: Record<string, SinkClass> = {
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
  "prototype pollution": "prototype-pollution",
};

export const BUG_WORDS = [
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
  "problems",
] as const;
