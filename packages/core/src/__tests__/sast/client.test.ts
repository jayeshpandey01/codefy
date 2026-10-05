import { describe, expect, it, vi } from "vitest";
import { SastClient, SecurityServiceApiError } from "../../sast/client.js";

describe("SastClient", () => {
  it("calls /health without authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", version: "0.1.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new SastClient({
      baseUrl: "https://test-sast.local",
      fetchImpl: fetchMock,
    });

    const health = await client.getHealth();
    expect(health.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test-sast.local/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("calls /v1/tools to fetch catalog without auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tools: [
            {
              id: "semgrep",
              name: "Semgrep",
              modes: ["passive", "active"],
              version: "1.78.0",
              category: "SAST",
              description: "Fast multi-language static analysis",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new SastClient({
      baseUrl: "https://test-sast.local",
      fetchImpl: fetchMock,
    });

    const catalog = await client.getTools();
    expect(catalog.tools).toHaveLength(1);
    expect(catalog.tools[0]?.id).toBe("semgrep");
  });

  it("throws SecurityServiceApiError when requesting protected endpoint without JWT", async () => {
    const client = new SastClient({
      baseUrl: "https://test-sast.local",
    });

    await expect(client.getJob("job_123")).rejects.toThrow(SecurityServiceApiError);
  });

  it("submits passive scan with Bearer token in multipart form", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job_passive_1",
          mode: "passive",
          status: "pending",
          status_url: "/v1/jobs/job_passive_1",
          created_at: "2026-10-06T01:00:00Z",
          expires_at: "2026-10-06T01:10:00Z",
          message: "Passive scan queued",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new SastClient({
      baseUrl: "https://test-sast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    const dummyZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const res = await client.submitPassiveScan(dummyZip, "code.zip");

    expect(res.job_id).toBe("job_passive_1");
    expect(res.mode).toBe("passive");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test-sast.local/v1/sast/scan",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );

    const calledHeaders = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Headers;
    expect(calledHeaders.get("Authorization")).toBe("Bearer test.jwt.bearer");
  });

  it("submits direct scan with file_key and SHA-256 hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job_cached_98",
          mode: "diff",
          status: "completed",
          status_url: "/v1/jobs/job_cached_98",
          created_at: "2026-10-06T01:00:00Z",
          expires_at: "2026-10-06T01:10:00Z",
          message: "Scan completed instantly from cache",
          cached: true,
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new SastClient({
      baseUrl: "https://test-sast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    const res = await client.submitDirectScan({
      file_key: "uploads/code.zip",
      file_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      mode: "diff",
    });

    expect(res.cached).toBe(true);
    expect(res.status).toBe("completed");
  });

  it("polls job until complete", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      const status = callCount >= 2 ? "completed" : "running";
      return Promise.resolve(
        new Response(
          JSON.stringify({
            job_id: "job_poll_1",
            user_id: "usr_1",
            mode: "passive",
            status,
            created_at: "2026-10-06T01:00:00Z",
            expires_at: "2026-10-06T01:10:00Z",
            findings: [],
            scanned_tools: ["semgrep"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    const client = new SastClient({
      baseUrl: "https://test-sast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    const job = await client.pollJobUntilComplete("job_poll_1", {
      intervalMs: 10,
      maxIntervalMs: 20,
    });

    expect(job.status).toBe("completed");
    expect(callCount).toBe(2);
  });

  it("fetches autofix git patch", async () => {
    const patchContent = `--- a/app.py\n+++ b/app.py\n@@ -1,1 +1,1 @@\n-eval(x)\n+ast.literal_eval(x)`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(patchContent, {
        status: 200,
        headers: { "Content-Type": "text/x-diff" },
      }),
    );

    const client = new SastClient({
      baseUrl: "https://test-sast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    const patch = await client.getAutofixPatch("job_fix_1");
    expect(patch).toContain("literal_eval");
  });
});
