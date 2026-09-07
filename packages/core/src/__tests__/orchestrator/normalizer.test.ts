import { describe, expect, it } from "vitest";
import type { ScanResultRead } from "@whoami/types";
import { normalizeRemoteFindings } from "../../orchestrator/normalizer.js";

describe("normalizeRemoteFindings", () => {
  it("converts remote scanner findings into WhoAmI Finding structures with graph traces", () => {
    const mockResult: ScanResultRead = {
      id: "result-uuid-1",
      scan_job_id: "scan-uuid-1",
      summary: {
        live_hosts_count: 1,
        risk_summary: {
          critical: 0,
          high: 1,
          medium: 1,
          low: 0,
          info: 1,
          total: 3,
        },
        findings: [
          {
            title: "Exposed Git Repository",
            severity: "high",
            description: "Found .git/HEAD exposed on the root web path.",
            host: "https://example.com/.git/HEAD",
            cwe: "CWE-200",
          },
          {
            title: "Missing Content Security Policy",
            severity: "medium",
            description: "Missing CSP header.",
            host: "https://example.com",
          },
        ],
      },
      created_at: "2026-09-01T00:00:00Z",
      artifact: null,
      error_logs: null,
    };

    const findings = normalizeRemoteFindings(mockResult, "example.com");
    expect(findings.length).toBe(2);

    const f1 = findings[0]!;
    expect(f1.id).toBe("remote-scan-uuid-1-1");
    expect(f1.severity).toBe("high");
    expect(f1.scope).toBe("endpoint");
    expect(f1.title).toBe("Exposed Git Repository");
    expect(f1.cwe).toBe("CWE-200");
    expect(f1.status).toBe("confirmed");
    expect(f1.trace.steps.length).toBe(3);
    expect(f1.trace.steps[0]?.role).toBe("source");
    expect(f1.trace.steps[2]?.role).toBe("sink");

    const f2 = findings[1]!;
    expect(f2.severity).toBe("medium");
    expect(f2.scope).toBe("endpoint");
    expect(f2.title).toBe("Missing Content Security Policy");
  });

  it("generates asset technology finding when technologies are discovered", () => {
    const mockResult: ScanResultRead = {
      id: "result-uuid-2",
      scan_job_id: "scan-uuid-2",
      summary: {
        live_hosts_count: 1,
        technologies: ["Nginx:1.24.0", "OpenSSL:3.0.2", "React"],
      },
      created_at: "2026-09-01T00:00:00Z",
      artifact: null,
      error_logs: null,
    };

    const findings = normalizeRemoteFindings(mockResult, "api.example.com");
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe("low");
    expect(findings[0]?.title).toBe("Discovered Web Technologies");
    expect(findings[0]?.description).toContain(
      "Nginx:1.24.0, OpenSSL:3.0.2, React",
    );
  });
});
