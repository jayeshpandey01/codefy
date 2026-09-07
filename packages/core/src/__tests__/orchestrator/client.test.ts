import { describe, expect, it, vi } from "vitest";
import type { SASTScanCreate, ScanCreate, TargetCreate } from "@whoami/types";
import {
  OrchestratorApiError,
  ScanOrchestratorClient,
} from "../../orchestrator/client.js";

describe("ScanOrchestratorClient", () => {
  it("calls /health without authentication", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ status: "ok" }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const health = await client.getHealth();
    expect(health.status).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string> | undefined;
    expect(url).toBe("https://test-orchestrator.local/health");
    expect(init.method).toBe("GET");
    expect(headers?.["X-API-Key"]).toBeUndefined();
  });

  it("routes ADMIN_API_KEY when registering targets", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "target-123",
        value: "example.com",
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-key-1",
      adminApiKey: "admin-key-99",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const targetPayload: TargetCreate = {
      value: "example.com",
      owner_reference: "Security Team",
      authorization_reference: "AUTH-123",
    };

    const target = await client.registerTarget(targetPayload);
    expect(target.id).toBe("target-123");
    expect(target.value).toBe("example.com");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://test-orchestrator.local/v1/targets");
    expect(init.method).toBe("POST");
    expect(headers["X-API-Key"]).toBe("admin-key-99");
    expect(JSON.parse(init.body as string)).toEqual(targetPayload);
  });

  it("automatically sanitizes full URLs and paths in registerTarget into a plain hostname", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "target-456",
        value: "api.target.internal",
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-key-99",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.registerTarget({
      value: "https://api.target.internal/api/v1?test=1#frag",
      owner_reference: "SecOps",
      authorization_reference: "AUTH-456",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.value).toBe("api.target.internal");
  });

  it("submits a scan and includes Idempotency-Key if specified", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "scan-uuid-456",
        target_id: "target-123",
        profile: "recon",
        status: "queued",
        controller_job_id: null,
        failure_reason: null,
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-key-1",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const scanPayload: ScanCreate = {
      target_id: "target-123",
      profile: "recon",
    };

    const scan = await client.submitScan(scanPayload, "idemp-key-xyz");
    expect(scan.id).toBe("scan-uuid-456");
    expect(scan.status).toBe("queued");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://test-orchestrator.local/v1/scans");
    expect(init.method).toBe("POST");
    expect(headers["X-API-Key"]).toBe("operator-key-1");
    expect(headers["Idempotency-Key"]).toBe("idemp-key-xyz");
  });

  it("throws OrchestratorApiError on 4xx/5xx responses with detailed messages", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => "application/json" },
      json: async () => ({ detail: "admin role required to register targets" }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-key-1",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await client.registerTarget({
        value: "example.com",
        owner_reference: "Ops",
        authorization_reference: "AUTH-1",
      });
      expect.unreachable("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(OrchestratorApiError);
      const apiErr = err as OrchestratorApiError;
      expect(apiErr.statusCode).toBe(403);
      expect(apiErr.scope).toBe("orchestrator");
      expect(apiErr.code).toBe("auth_failed");
      expect(apiErr.hint).toBeDefined();
      expect(apiErr.fix).toBeDefined();
    }
  });

  it("polls scan status until completed", async () => {
    let callIndex = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/result")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            id: "res-1",
            scan_job_id: "scan-1",
            summary: { live_hosts_count: 1, findings: [] },
            created_at: "2026-09-01T00:00:00Z",
            artifact: null,
            error_logs: null,
          }),
        };
      }

      callIndex++;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          id: "scan-1",
          target_id: "target-1",
          profile: "recon",
          status: callIndex === 1 ? "queued" : "completed",
          controller_job_id: null,
          failure_reason: null,
          created_at: "2026-09-01T00:00:00Z",
        }),
      };
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-key-1",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const progressUpdates: string[] = [];
    const { scan, result } = await client.pollScanUntilComplete("scan-1", {
      intervalMs: 10,
      maxWaitMs: 1000,
      onProgress: (s) => progressUpdates.push(s.status),
    });

    expect(scan.status).toBe("completed");
    expect(result).toBeDefined();
    expect(result?.id).toBe("res-1");
    expect(progressUpdates).toEqual(["queued", "completed"]);
  });

  it("fetches SAST profiles without requiring auth header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        sast_profiles: [
          {
            profile: "sast-joern",
            engine: "Joern CPG",
            languages: ["Python"],
            capabilities: ["Taint"],
            purpose: "Dataflow analysis",
          },
        ],
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const profiles = await client.getSastProfiles();
    expect(profiles.sast_profiles.length).toBe(1);
    expect(profiles.sast_profiles[0]?.profile).toBe("sast-joern");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string> | undefined;
    expect(url).toBe("https://test-orchestrator.local/v1/sast/profiles");
    expect(init.method).toBe("GET");
    expect(headers?.["X-API-Key"]).toBeUndefined();
  });

  it("submits SAST scan and cancels it with operator auth", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: { get: () => "application/json" },
        json: async () => ({
          id: "sast-scan-1",
          target_id: "target-1",
          profile: "sast-semgrep",
          status: "queued",
          controller_job_id: null,
          failure_reason: null,
          created_at: "2026-09-01T00:00:00Z",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          id: "sast-scan-1",
          target_id: "target-1",
          profile: "sast-semgrep",
          status: "cancelled",
          controller_job_id: null,
          failure_reason: null,
          created_at: "2026-09-01T00:00:00Z",
        }),
      });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-secret-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const scan = await client.submitSastScan({
      target_id: "target-1",
      profile: "sast-semgrep",
      rule_tags: ["owasp"],
    });
    expect(scan.id).toBe("sast-scan-1");
    expect(scan.status).toBe("queued");

    const [postUrl, postInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toBe("https://test-orchestrator.local/v1/sast/scans");
    expect((postInit.headers as Record<string, string>)["X-API-Key"]).toBe(
      "operator-secret-key",
    );

    const cancelled = await client.cancelSastScan("sast-scan-1");
    expect(cancelled.status).toBe("cancelled");

    const [cancelUrl, cancelInit] = mockFetch.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(cancelUrl).toBe(
      "https://test-orchestrator.local/v1/sast/scans/sast-scan-1/cancel",
    );
    expect(cancelInit.method).toBe("POST");
  });
});

