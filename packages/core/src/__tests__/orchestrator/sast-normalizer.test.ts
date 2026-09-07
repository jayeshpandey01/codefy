import { describe, expect, it } from "vitest";
import type { ScanResultRead } from "@whoami/types";
import { normalizeRemoteFindings } from "../../orchestrator/normalizer.js";

describe("normalizeRemoteFindings for SAST engines", () => {
  it("normalizes Joern CPG scan results with multi-step taint propagation traces", () => {
    const joernResult: ScanResultRead = {
      id: "joern-result-1",
      scan_job_id: "scan-joern-001",
      created_at: "2026-09-03T07:43:58.626000Z",
      artifact: null,
      error_logs: null,
      summary: {
        risk_summary: {
          critical: 1,
          high: 1,
          medium: 1,
          low: 0,
          info: 0,
          total: 3,
        },
        scanned_files_count: 2,
        total_rules_evaluated: 3,
        findings: [
          {
            id: "SEC-001",
            code: "JOERN_CPG_SQLI_TAINT",
            severity: "CRITICAL",
            title: "SQL Injection in /api/user Request Handler",
            description:
              "HTTP GET parameter 'id' reaches SQL query execution sink without parameterization.",
            evidence: {
              location: "test_sample_app/main.py:17 (get_user)",
              file: "test_sample_app/main.py",
              line: 17,
              function: "get_user",
              snippet:
                "query = f\"SELECT id, username, email FROM users WHERE id = '{user_id}'\"",
              flow: [
                {
                  step: 1,
                  location: "test_sample_app/main.py:12",
                  variable: "user_id",
                  type: "Source (request.args.get)",
                },
                {
                  step: 2,
                  location: "test_sample_app/main.py:17",
                  variable: "query",
                  type: "Taint Propagation (f-string interpolation)",
                },
                {
                  step: 3,
                  location: "test_sample_app/main.py:18",
                  variable: "cursor.execute",
                  type: "Sink (SQL Execution Engine)",
                },
              ],
            },
            remediation:
              "Use parameterized queries or ORM abstractions instead of concatenating raw user input into SQL queries.",
          },
        ],
      },
    };

    const findings = normalizeRemoteFindings(joernResult, "sample-repo");
    expect(findings.length).toBe(1);

    const f = findings[0]!;
    expect(f.id).toBe("remote-scan-joern-001-1");
    expect(f.code).toBe("JOERN_CPG_SQLI_TAINT");
    expect(f.severity).toBe("critical");
    expect(f.scope).toBe("code");
    expect(f.cwe).toBe("CWE-89");
    expect(f.trace.sinkClass).toBe("sql-injection");
    expect(f.trace.steps.length).toBe(3);

    // Step 1: Source
    expect(f.trace.steps[0]?.role).toBe("source");
    expect(f.trace.steps[0]?.filePath).toBe("test_sample_app/main.py");
    expect(f.trace.steps[0]?.line).toBe(12);
    expect(f.trace.steps[0]?.label).toContain("user_id");

    // Step 2: Propagation
    expect(f.trace.steps[1]?.role).toBe("sanitizer");
    expect(f.trace.steps[1]?.line).toBe(17);
    expect(f.trace.steps[1]?.label).toContain("query");

    // Step 3: Sink
    expect(f.trace.steps[2]?.role).toBe("sink");
    expect(f.trace.steps[2]?.line).toBe(18);
    expect(f.trace.steps[2]?.label).toContain("cursor.execute");

    expect(f.hint).toContain("parameterized queries");
  });

  it("normalizes Semgrep AST findings with CWE, line, and remediation", () => {
    const semgrepResult: ScanResultRead = {
      id: "semgrep-result-1",
      scan_job_id: "scan-semgrep-002",
      created_at: "2026-09-03T07:43:46.359000Z",
      artifact: null,
      error_logs: null,
      summary: {
        risk_summary: {
          critical: 1,
          high: 1,
          medium: 0,
          low: 0,
          info: 0,
          total: 2,
        },
        scanned_files_count: 3,
        total_rules_evaluated: 9,
        findings: [
          {
            id: "SEC-001",
            code: "SEMGREP_PYTHON_LANG_SECURITY_SYSTEM_CALL",
            severity: "CRITICAL",
            title: "OS Command Injection via os.system",
            description: "Request data detected in os.system.",
            evidence: {
              location: "test_sample_app/main.py:26:5",
              file: "test_sample_app/main.py",
              line: 26,
              column: 5,
              snippet: "os.system(cmd)",
              check_id: "python.lang.security.audit.dangerous-system-call",
              cwe: [
                "CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')",
              ],
              owasp: ["A03:2021 - Injection"],
            },
            remediation:
              "Avoid executing dynamic shell commands. Use subprocess with argument lists and shell=False.",
          },
          {
            id: "SEC-002",
            code: "SEMGREP_GENERIC_SECRETS_HARDCODED_JWT_SECRET",
            severity: "HIGH",
            title: "Hardcoded JWT Secret Disclosed",
            description: "Hardcoded JWT secret or private key is used.",
            evidence: {
              location: "test_sample_app/auth.py:13:13",
              file: "test_sample_app/auth.py",
              line: 13,
              column: 13,
              snippet: "JWT_SECRET_KEY = 'super_secret'",
              check_id: "generic.secrets.security.detected-hardcoded-secret",
              cwe: ["CWE-798: Use of Hard-coded Credentials"],
              owasp: ["A07:2021 - Identification and Authentication Failures"],
            },
            remediation:
              "Store secrets in environment variables or a dedicated secrets manager.",
          },
        ],
      },
    };

    const findings = normalizeRemoteFindings(semgrepResult, "repo");
    expect(findings.length).toBe(2);

    const f1 = findings[0]!;
    expect(f1.cwe).toBe("CWE-78");
    expect(f1.severity).toBe("critical");
    expect(f1.scope).toBe("code");
    expect(f1.trace.sinkClass).toBe("command-injection");
    expect(f1.trace.steps[2]?.line).toBe(26);

    const f2 = findings[1]!;
    expect(f2.cwe).toBe("CWE-798");
    expect(f2.severity).toBe("high");
    expect(f2.scope).toBe("code");
    expect(f2.trace.sinkClass).toBe("secret-exposure");
  });

  it("normalizes TruffleHog secret leak detections with rotation guide links", () => {
    const trufflehogResult: ScanResultRead = {
      id: "trufflehog-result-1",
      scan_job_id: "scan-trufflehog-003",
      created_at: "2026-09-03T07:43:55.641000Z",
      artifact: null,
      error_logs: null,
      summary: {
        risk_summary: {
          critical: 0,
          high: 2,
          medium: 0,
          low: 0,
          info: 0,
          total: 2,
        },
        scanned_files_count: 2,
        total_rules_evaluated: 2,
        findings: [
          {
            id: "SEC-001",
            code: "TRUFFLEHOG_GITHUB",
            severity: "HIGH",
            title: "Potential Leaked Github Secret Detected",
            description: "Potential Leaked Github credential discovered.",
            evidence: {
              location: "test_sample_app/config.py:11",
              file: "test_sample_app/config.py",
              line: 11,
              detector: "Github",
              verified: false,
              redacted_secret: "<REDACTED>",
              extra_data: {
                rotation_guide: "https://howtorotate.com/docs/tutorials/github/",
                version: "2",
              },
            },
            remediation:
              "Revoke the exposed GitHub token or SSH key immediately in GitHub Developer Settings.",
          },
        ],
      },
    };

    const findings = normalizeRemoteFindings(trufflehogResult, "repo");
    expect(findings.length).toBe(1);

    const f = findings[0]!;
    expect(f.scope).toBe("secrets");
    expect(f.trace.sinkClass).toBe("secret-exposure");
    expect(f.cwe).toBe("CWE-798");
    expect(f.link).toBe("https://howtorotate.com/docs/tutorials/github/");
    expect(f.trace.steps.length).toBe(2);
    expect(f.trace.steps[1]?.label).toContain("Github");
  });
});
