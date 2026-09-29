import type { FindingStatus, Severity } from "./findings.js";

/** Controls which sections a generated report includes. */
export interface ReportOptions {
  readonly includeSecrets: boolean;
  readonly includeTaintPaths: boolean;
  /** Include an illustrative before/after "Suggested Fix" diff per finding. */
  readonly includeFixDiff: boolean;
  /** Omit findings below this severity from the issue table and detail sections. */
  readonly minSeverity?: Severity;
}

export interface ReportSummary {
  readonly total: number;
  readonly bySeverity: Record<Severity, number>;
  readonly byStatus: Record<FindingStatus, number>;
}

/**
 * Markdown is the canonical output of report generation; a PDF is a
 * rendering of this same string, never a second source of truth.
 */
export interface GeneratedReport {
  readonly sessionId: string;
  readonly generatedAt: string;
  readonly markdown: string;
  readonly summary: ReportSummary;
}
