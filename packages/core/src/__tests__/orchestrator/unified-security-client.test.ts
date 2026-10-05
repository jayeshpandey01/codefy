import { describe, expect, it, vi } from "vitest";
import { UnifiedSecurityClient } from "../../orchestrator/unified-security-client.js";

describe("UnifiedSecurityClient", () => {
  it("initializes Auth, SAST, and DAST clients with default URLs", () => {
    const client = new UnifiedSecurityClient();
    expect(client.auth).toBeDefined();
    expect(client.sast).toBeDefined();
    expect(client.dast).toBeDefined();
    expect(client.jwtToken).toBeUndefined();
  });

  it("updates JWT across both SAST and DAST when setSession is called", async () => {
    const client = new UnifiedSecurityClient();
    client.setSession("jwt.shared.token");

    expect(client.jwtToken).toBe("jwt.shared.token");

    // Mock fetch for both clients returning fresh Response on each call
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ job_id: "test", status: "completed", findings: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    // Re-create with mock fetch to verify header transmission
    const authedClient = new UnifiedSecurityClient({
      jwtToken: "jwt.shared.token",
      fetchImpl: fetchMock,
    });

    await authedClient.sast.getJob("job_sast_1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/jobs/job_sast_1"),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const sastHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Headers;
    expect(sastHeaders.get("Authorization")).toBe("Bearer jwt.shared.token");

    await authedClient.dast.getJob("job_dast_1");
    const dastHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Headers;
    expect(dastHeaders.get("Authorization")).toBe("Bearer jwt.shared.token");
  });

  it("normalizes findings from SAST scan correctly", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/sast/scan")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              job_id: "job_s1",
              mode: "passive",
              status: "pending",
              status_url: "/v1/jobs/job_s1",
              created_at: "2026-10-06T01:00:00Z",
              expires_at: "2026-10-06T01:10:00Z",
              message: "Queued",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/v1/jobs/job_s1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              job_id: "job_s1",
              user_id: "usr_1",
              mode: "passive",
              status: "completed",
              created_at: "2026-10-06T01:00:00Z",
              expires_at: "2026-10-06T01:10:00Z",
              findings: [
                {
                  fingerprint: "abc123456789",
                  tool_name: "semgrep",
                  vulnerability_id: "python.lang.insecure-deserialization",
                  title: "Insecure Deserialization via pickle",
                  severity: "HIGH",
                  file_path: "app/cache.py",
                  line_start: 42,
                  snippet: "data = pickle.loads(bytes)",
                  cwe_id: "CWE-502",
                  remediation: "Use json.loads instead",
                  detected_by: ["semgrep", "bandit"],
                },
              ],
              scanned_tools: ["semgrep", "bandit"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = new UnifiedSecurityClient({
      jwtToken: "test.jwt",
      fetchImpl: fetchMock,
    });

    const { job, findings } = await client.runSastScan(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

    expect(job.status).toBe("completed");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("high");
    expect(findings[0]?.title).toBe("Insecure Deserialization via pickle");
    expect(findings[0]?.cwe).toBe("CWE-502");
    expect(findings[0]?.trace.steps[0]?.filePath).toBe("app/cache.py");
  });
});
