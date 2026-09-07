import type { Finding } from "@whoami/types";

export const FIXTURE_FINDINGS: readonly Finding[] = [
  {
    id: "F-10291",
    ruleId: "js-sql-injection-string-concat",
    status: "confirmed",
    severity: "critical",
    title: "SQL Injection",
    description: "SQL query built via string concatenation.",
    cwe: "CWE-89",
    reason: "SQL query built via string concatenation instead of parameterized placeholders.",
    createdAt: "2026-09-01T00:00:00.000Z",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        { role: "source", label: "request.args.id", filePath: "api/users.py", line: 42 },
        { role: "sink", label: "db.execute", filePath: "database.py", line: 87 },
      ],
    },
  },
  {
    id: "F-2001",
    ruleId: "js-ssrf-unvalidated-url",
    status: "needs-verification",
    severity: "medium",
    title: "Potential SSRF",
    description: "Unvalidated URL reaches an outbound HTTP call.",
    cwe: "CWE-918",
    reason: "A guard exists but did not match a known-safe pattern.",
    createdAt: "2026-09-01T00:00:00.000Z",
    trace: {
      sinkClass: "ssrf",
      steps: [
        { role: "source", label: "req.body.url", filePath: "src/fetcher.ts", line: 10 },
        { role: "sanitizer", label: "isMaybeOk(url)", filePath: "src/fetcher.ts", line: 12 },
        { role: "sink", label: "fetch(url)", filePath: "src/fetcher.ts", line: 14 },
      ],
    },
  },
  {
    id: "F-3050",
    ruleId: "js-path-traversal",
    status: "discarded",
    severity: "low",
    title: "Path traversal (guarded)",
    description: "Path normalized and boundary-checked before use.",
    cwe: "CWE-22",
    createdAt: "2026-09-01T00:00:00.000Z",
    trace: {
      sinkClass: "path-traversal",
      steps: [
        { role: "source", label: "req.query.file", filePath: "src/files.ts", line: 5 },
        { role: "sanitizer", label: "resolveSafe(file)", filePath: "src/files.ts", line: 7 },
        { role: "sink", label: "fs.readFile(safePath)", filePath: "src/files.ts", line: 9 },
      ],
    },
  },
  {
    id: "remote-recon-1699999999-0",
    ruleId: "remote-recon-finding",
    scope: "orchestrator",
    status: "confirmed",
    severity: "high",
    title: "Recon (api.target.internal)",
    description: "Remote security orchestrator verified recon finding.",
    cwe: "CWE-699",
    createdAt: "2026-09-01T00:00:00.000Z",
    trace: {
      sinkClass: "ssrf",
      steps: [
        { role: "source", label: "Target Host: api.target.internal", filePath: "https://api.target.internal", line: 1 },
        { role: "sink", label: "recon verified probe signature", filePath: "https://api.target.internal/api/v1", line: 1 },
      ],
    },
  },
];
