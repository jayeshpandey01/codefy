import { describe, expect, it } from "vitest";
import type { Finding, ScanSessionWithFindings, SecretFinding } from "@whoami/types";
import { generateMarkdownReport } from "../../report/generator.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    ruleId: "rule-1",
    status: "confirmed",
    severity: "high",
    title: "Command Injection",
    description: "User input flows into exec()",
    cwe: "CWE-78",
    trace: {
      sinkClass: "command-injection",
      steps: [
        { role: "source", label: "req.query.host", filePath: "src/app.ts", line: 10 },
        { role: "sink", label: "exec()", filePath: "src/app.ts", line: 20 },
      ],
    },
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function makeSession(findings: readonly Finding[]): ScanSessionWithFindings {
  return {
    id: "session-1",
    workspacePath: "/tmp/project",
    startedAt: 0,
    finishedAt: 1000,
    mode: "full",
    findingsCount: findings.length,
    findings,
  };
}

describe("generateMarkdownReport", () => {
  it("produces a valid minimal report for a session with no findings", () => {
    const report = generateMarkdownReport(makeSession([]));
    expect(report.sessionId).toBe("session-1");
    expect(report.summary.total).toBe(0);
    expect(report.markdown).toContain("No findings to report.");
    expect(report.markdown).toContain("No confirmed or needs-verification findings.");
  });

  it("sorts the issue table by severity, critical first", () => {
    const findings = [
      makeFinding({ id: "low", severity: "low", title: "Low issue" }),
      makeFinding({ id: "crit", severity: "critical", title: "Critical issue" }),
      makeFinding({ id: "med", severity: "medium", title: "Medium issue" }),
    ];
    const report = generateMarkdownReport(makeSession(findings));
    const criticalIndex = report.markdown.indexOf("Critical issue");
    const mediumIndex = report.markdown.indexOf("Medium issue");
    const lowIndex = report.markdown.indexOf("Low issue");
    expect(criticalIndex).toBeGreaterThan(-1);
    expect(criticalIndex).toBeLessThan(mediumIndex);
    expect(mediumIndex).toBeLessThan(lowIndex);
    expect(report.summary.bySeverity.critical).toBe(1);
    expect(report.summary.bySeverity.medium).toBe(1);
    expect(report.summary.bySeverity.low).toBe(1);
  });

  it("escapes markdown table-breaking characters in title and description", () => {
    const findings = [
      makeFinding({
        title: "Pipe | and `backtick` issue",
        description: "line one\nline two",
      }),
    ];
    const report = generateMarkdownReport(makeSession(findings));
    expect(report.markdown).toContain("Pipe \\| and \\`backtick\\` issue");
  });

  it("renders taint path steps when includeTaintPaths is true", () => {
    const report = generateMarkdownReport(makeSession([makeFinding()]), [], {
      includeSecrets: false,
      includeTaintPaths: true,
      includeFixDiff: false,
    });
    expect(report.markdown).toContain("#### Taint Path (`command-injection`)");
    expect(report.markdown).toContain("req.query.host");
    expect(report.markdown).toContain("exec()");
  });

  it("omits taint path rendering when includeTaintPaths is false", () => {
    const report = generateMarkdownReport(makeSession([makeFinding()]), [], {
      includeSecrets: false,
      includeTaintPaths: false,
      includeFixDiff: false,
    });
    expect(report.markdown).not.toContain("Taint Path");
  });

  it("includes a secrets section only when includeSecrets is true", () => {
    const secrets: SecretFinding[] = [
      { id: "s1", kind: "aws-access-key", filePath: "src/config.ts", line: 5 },
    ];
    const withSecrets = generateMarkdownReport(makeSession([]), secrets, {
      includeSecrets: true,
      includeTaintPaths: false,
      includeFixDiff: false,
    });
    expect(withSecrets.markdown).toContain("aws-access-key");

    const withoutSecrets = generateMarkdownReport(makeSession([]), secrets, {
      includeSecrets: false,
      includeTaintPaths: false,
      includeFixDiff: false,
    });
    expect(withoutSecrets.markdown).not.toContain("## Secrets");
  });

  it("filters out findings below minSeverity", () => {
    const findings = [
      makeFinding({ id: "crit", severity: "critical", title: "Critical issue" }),
      makeFinding({ id: "low", severity: "low", title: "Low issue" }),
    ];
    const report = generateMarkdownReport(makeSession(findings), [], {
      includeSecrets: false,
      includeTaintPaths: false,
      includeFixDiff: false,
      minSeverity: "high",
    });
    expect(report.markdown).toContain("Critical issue");
    expect(report.markdown).not.toContain("Low issue");
    expect(report.summary.total).toBe(1);
  });

  it("renders a before/after fix diff block when includeFixDiff is true", () => {
    const report = generateMarkdownReport(
      makeSession([makeFinding({ ruleId: "js-command-injection-exec" })]),
      [],
      { includeSecrets: false, includeTaintPaths: false, includeFixDiff: true },
    );
    expect(report.markdown).toContain("#### Suggested Fix");
    expect(report.markdown).toContain("File: `src/app.ts`");
    expect(report.markdown).toContain("```diff");
    expect(report.markdown).toContain('-  exec(`convert ${filename} output.png`, (err, stdout) => {');
    expect(report.markdown).toContain('+  execFile("convert", [filename, "output.png"], (err, stdout) => {');
  });

  it("omits the fix diff block when includeFixDiff is false", () => {
    const report = generateMarkdownReport(makeSession([makeFinding()]), [], {
      includeSecrets: false,
      includeTaintPaths: false,
      includeFixDiff: false,
    });
    expect(report.markdown).not.toContain("#### Suggested Fix");
    expect(report.markdown).not.toContain("```diff");
  });

  it("skips discarded findings in the detail section but keeps them in the issue table", () => {
    const findings = [
      makeFinding({ id: "discarded", status: "discarded", title: "Discarded issue" }),
    ];
    const report = generateMarkdownReport(makeSession(findings));
    expect(report.markdown).toContain("| high | CWE-78 | Discarded issue |");
    expect(report.markdown).toContain("No confirmed or needs-verification findings.");
  });
});
