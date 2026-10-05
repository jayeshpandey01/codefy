import { describe, expect, it, vi } from "vitest";
import { DastClient } from "../../dast/client.js";
import { SecurityServiceApiError } from "../../sast/client.js";

describe("DastClient", () => {
  it("calls /health without authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok", uptime_seconds: 120 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = new DastClient({
      baseUrl: "https://test-dast.local",
      fetchImpl: fetchMock,
    });

    const health = await client.getHealth();
    expect(health.status).toBe("ok");
  });

  it("calls /v1/dast/tools to fetch catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tools: [
            {
              id: "owasp-zap",
              name: "OWASP ZAP",
              category: "DAST Engine",
              description: "Web crawler and active fuzzer",
            },
            {
              id: "nuclei",
              name: "Nuclei",
              category: "Vulnerability Scanner",
              description: "Fast template-based scanner",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new DastClient({
      baseUrl: "https://test-dast.local",
      fetchImpl: fetchMock,
    });

    const catalog = await client.getTools();
    expect(catalog.tools).toHaveLength(2);
    expect(catalog.tools[0]?.id).toBe("owasp-zap");
  });

  it("validates target URL for SSRF protection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          target_url: "https://example.com",
          safe_to_scan: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new DastClient({
      baseUrl: "https://test-dast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    const validation = await client.validateTarget("https://example.com");
    expect(validation.safe_to_scan).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test-dast.local/v1/dast/validate-target?target_url=https%3A%2F%2Fexample.com",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("submits DAST scan with custom parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "dast_job_99",
          target_url: "https://example.com",
          mode: "passive",
          status: "pending",
          status_url: "/v1/jobs/dast_job_99",
          created_at: "2026-10-06T01:00:00Z",
          expires_at: "2026-10-07T01:00:00Z",
          message: "Scan queued",
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new DastClient({
      baseUrl: "https://test-dast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    const res = await client.submitScan({
      target_url: "https://example.com",
      mode: "passive",
      crawl_depth: 3,
    });

    expect(res.job_id).toBe("dast_job_99");
    expect(res.status).toBe("pending");
  });

  it("handles SSRF block response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Target hostname resolves to a restricted private or internal IP (127.0.0.1).",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new DastClient({
      baseUrl: "https://test-dast.local",
      jwtToken: "test.jwt.bearer",
      fetchImpl: fetchMock,
    });

    await expect(
      client.submitScan({ target_url: "http://127.0.0.1:8000" }),
    ).rejects.toThrow("Target hostname resolves to a restricted private or internal IP");
  });
});
