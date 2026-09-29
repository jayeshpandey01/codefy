import type {
  Finding,
  FindingStatus,
  GeneratedReport,
  ReportOptions,
  ReportSummary,
  ScanSessionWithFindings,
  SecretFinding,
  Severity,
} from "@whoami/types";
import { APP_VERSION } from "../logging/index.js";
import { generateFixDiffText, generateUnifiedDiff } from "./diff-suggestion.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const DEFAULT_OPTIONS: ReportOptions = {
  includeSecrets: true,
  includeTaintPaths: true,
  includeFixDiff: true,
};

/** Escapes a value for safe use inside a markdown table cell. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "\\`").replace(/\r?\n/g, " ");
}

function meetsMinSeverity(severity: Severity, minSeverity?: Severity): boolean {
  if (!minSeverity) return true;
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[minSeverity];
}

function sinkLocation(finding: Finding): string {
  const steps = finding.trace.steps;
  const step = steps[steps.length - 1] ?? steps[0];
  if (!step) return "—";
  return `${step.filePath}:${step.line}`;
}

function buildSummary(findings: readonly Finding[]): ReportSummary {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const byStatus: Record<FindingStatus, number> = {
    confirmed: 0,
    "needs-verification": 0,
    discarded: 0,
  };
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byStatus[finding.status] += 1;
  }
  return { total: findings.length, bySeverity, byStatus };
}

function renderSummarySection(summary: ReportSummary): string {
  const severityRows = (Object.keys(summary.bySeverity) as Severity[])
    .sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])
    .map((severity) => `| ${severity} | ${summary.bySeverity[severity]} |`)
    .join("\n");
  const statusRows = (Object.keys(summary.byStatus) as FindingStatus[])
    .map((status) => `| ${status} | ${summary.byStatus[status]} |`)
    .join("\n");

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
    statusRows,
  ].join("\n");
}

function renderIssueTable(findings: readonly Finding[]): string {
  if (findings.length === 0) {
    return "## Issues\n\nNo findings to report.";
  }
  const rows = findings
    .map(
      (finding) =>
        `| ${finding.severity} | ${escapeCell(finding.cwe ?? "—")} | ${escapeCell(
          finding.title,
        )} | ${escapeCell(sinkLocation(finding))} | ${finding.status} |`,
    )
    .join("\n");

  return [
    "## Issues",
    "",
    "| Severity | CWE | Title | Location | Status |",
    "| --- | --- | --- | --- | --- |",
    rows,
  ].join("\n");
}

function renderTaintPath(finding: Finding): string {
  const steps = finding.trace.steps.map(
    (step, index) => `${index + 1}. **${step.role}** — ${step.label} (${step.filePath}:${step.line})`,
  );
  return [`#### Taint Path (\`${finding.trace.sinkClass}\`)`, "", ...steps].join("\n");
}

function renderFixDiff(finding: Finding): string {
  const diff = generateFixDiffText(finding);
  const unified = generateUnifiedDiff(diff.originalCode, diff.modifiedCode);
  return [
    "#### Suggested Fix",
    "",
    `File: \`${diff.filePath}\``,
    "",
    "```diff",
    unified,
    "```",
  ].join("\n");
}

function renderFindingDetail(finding: Finding, includeTaintPaths: boolean, includeFixDiff: boolean): string {
  const lines = [
    `### ${escapeCell(finding.title)} (${finding.severity})`,
    "",
    finding.cwe ? `CWE: ${finding.cwe}` : undefined,
    `Status: ${finding.status}`,
    `Location: ${sinkLocation(finding)}`,
    "",
    finding.description,
  ].filter((line): line is string => line !== undefined);

  if (finding.reason) lines.push("", `Reason: ${finding.reason}`);
  if (finding.hint) lines.push("", `Remediation: ${finding.hint}`);
  if (finding.link) lines.push("", `Reference: ${finding.link}`);
  if (includeFixDiff) lines.push("", "---", "", renderFixDiff(finding));
  if (includeTaintPaths && finding.trace.steps.length > 0) {
    lines.push("", "---", "", renderTaintPath(finding));
  }

  return lines.join("\n");
}

function renderSecretsSection(secrets: readonly SecretFinding[]): string {
  if (secrets.length === 0) {
    return "## Secrets\n\nNo secrets detected.";
  }
  const rows = secrets
    .map(
      (secret) =>
        `| ${secret.kind} | ${escapeCell(secret.filePath)}:${secret.line} | ${
          secret.matchedPattern ? escapeCell(secret.matchedPattern) : "—"
        } |`,
    )
    .join("\n");

  return [
    "## Secrets",
    "",
    "| Kind | Location | Matched Pattern |",
    "| --- | --- | --- |",
    rows,
  ].join("\n");
}

/**
 * Serializes a persisted scan session into a self-contained Markdown report.
 * Pure templating over already-verified data — no LLM/analysis involved.
 * Markdown is the canonical output; a PDF is a rendering of this same
 * string, produced downstream in packages/ui, never a second source of truth.
 */
export function generateMarkdownReport(
  session: ScanSessionWithFindings,
  secrets: readonly SecretFinding[] = [],
  options: ReportOptions = DEFAULT_OPTIONS,
): GeneratedReport {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const eligibleFindings = session.findings
    .filter((finding) => meetsMinSeverity(finding.severity, opts.minSeverity))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const summary = buildSummary(eligibleFindings);
  const detailFindings = eligibleFindings.filter((finding) => finding.status !== "discarded");
  const generatedAt = new Date().toISOString();

  const sections = [
    `# Scan Report`,
    "",
    `- Workspace: \`${session.workspacePath}\``,
    `- Scan mode: ${session.mode}`,
    `- Started: ${new Date(session.startedAt).toISOString()}`,
    session.finishedAt ? `- Finished: ${new Date(session.finishedAt).toISOString()}` : undefined,
    `- Generated: ${generatedAt}`,
    `- WhoAmI version: ${APP_VERSION}`,
    "",
    renderSummarySection(summary),
    "",
    renderIssueTable(eligibleFindings),
    "",
    "## Details",
    "",
    detailFindings.length > 0
      ? detailFindings
          .map((finding) => renderFindingDetail(finding, opts.includeTaintPaths, opts.includeFixDiff))
          .join("\n\n")
      : "No confirmed or needs-verification findings.",
  ].filter((line): line is string => line !== undefined);

  if (opts.includeSecrets) {
    sections.push("", renderSecretsSection(secrets));
  }

  return {
    sessionId: session.id,
    generatedAt,
    markdown: sections.join("\n"),
    summary,
  };
}
