import { describe, expect, it, vi } from "vitest";
import type {
  ControllerJobCompletePayload,
  ControllerJobFailPayload,
  SASTScanCreate,
  ScanCreate,
  TargetCreate,
} from "@whoami/types";
import {
  buildQueryString,
  OrchestratorApiError,
  ScanOrchestratorClient,
} from "../../orchestrator/client.js";
import {
  generateControllerHmacHeaders,
  signControllerMessage,
} from "../../orchestrator/hmac.js";

describe("ScanOrchestratorClient", () => {
  // ==========================================================================
  // 1. Operational Endpoints
  // ==========================================================================

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
    expect(headers?.["Authorization"]).toBeUndefined();
  });

  it("calls /health/live for liveness probe", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ status: "alive" }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const live = await client.getLiveness();
    expect(live.status).toBe("alive");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/health/live");
  });

  it("calls /health/ready for readiness probe (success and 503)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ status: "ready", database: "ok" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: { get: () => "application/json" },
        json: async () => ({ status: "degraded", database: "disconnected" }),
      });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const ready = await client.getReadiness();
    expect(ready.status).toBe("ready");

    await expect(client.getReadiness()).rejects.toThrow(OrchestratorApiError);
  });

  // ==========================================================================
  // 2. Authentication Routing & Role Enforcement
  // ==========================================================================

  it("routes the signed-in user's bearer token when registering targets", async () => {
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
      jwtToken: "signed-in-user-token",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const targetPayload: TargetCreate = {
      value: "example.com",
      owner_reference: "Security Team",
      authorization_reference: "AUTH-123",
      authorization_confirmed: true,
    };

    const target = await client.registerTarget(targetPayload);
    expect(target.id).toBe("target-123");
    expect(target.value).toBe("example.com");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://test-orchestrator.local/v1/targets");
    expect(init.method).toBe("POST");
    expect(headers.Authorization).toBe("Bearer signed-in-user-token");
    expect(headers["X-API-Key"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({
      ...targetPayload,
      target_type: "network",
    });
  });

  it("routes Bearer token when configured with bearer authMode or jwtToken", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "target-123",
        value: "example.com",
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      jwtToken: "jwt.header.payload.signature",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.getTarget("target-123");

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer jwt.header.payload.signature");
  });

  it("requires a signed-in user for target registration", async () => {
    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      fetchFn: vi.fn() as unknown as typeof fetch,
    });

    await expect(
      client.registerTarget({
        value: "example.com",
        owner_reference: "Ops",
        authorization_reference: "AUTH-1",
        authorization_confirmed: true,
      }),
    ).rejects.toThrow("Sign in to use cloud scans");
  });

  // ==========================================================================
  // 3. Target Management
  // ==========================================================================

  it("automatically sanitizes full URLs and paths in registerTarget into a plain hostname", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "target-456",
        value: "scanme.nmap.org",
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-key-99",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.registerTarget({
      value: "https://scanme.nmap.org:8080/api/v1?test=1#frag",
      owner_reference: "SecOps",
      authorization_reference: "AUTH-456",
      authorization_confirmed: true,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.value).toBe("scanme.nmap.org");
    expect(parsedBody.target_type).toBe("network");
  });

  it("preserves local source directory path and sets target_type to source_code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "target-789",
        value: "/Users/test/project",
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-key-99",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.registerTarget({
      value: "/Users/test/project",
      owner_reference: "SecOps",
      authorization_reference: "AUTH-789",
      authorization_confirmed: true,
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.value).toBe("/Users/test/project");
    expect(parsedBody.target_type).toBe("source_code");
  });

  it("lists targets with pagination parameters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => [
        { id: "t-1", value: "a.com", created_at: "2026-09-01T00:00:00Z" },
      ],
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-secret",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const targets = await client.listTargets({ skip: 10, limit: 25 });
    expect(targets.length).toBe(1);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/v1/targets?skip=10&limit=25");
  });

  it("retrieves a single target by id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ id: "t-xyz", value: "example.org", created_at: "2026-09-01T00:00:00Z" }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-secret",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const target = await client.getTarget("t-xyz");
    expect(target.id).toBe("t-xyz");

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/v1/targets/t-xyz");
  });

  // ==========================================================================
  // 4. DAST Scan Lifecycle
  // ==========================================================================

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

  it("lists scans with filter parameters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => [],
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-key-1",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await client.listScans({ status: "running", profile: "vuln-assessment", limit: 5 });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://test-orchestrator.local/v1/scans?status=running&profile=vuln-assessment&limit=5",
    );
  });

  it("retries a failed or cancelled scan", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "scan-retry-1",
        target_id: "target-1",
        profile: "vuln-assessment",
        status: "queued",
        created_at: "2026-09-01T00:00:00Z",
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-key-1",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const retried = await client.retryScan("scan-retry-1");
    expect(retried.status).toBe("queued");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/v1/scans/scan-retry-1/retry");
    expect(init.method).toBe("POST");
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

  // ==========================================================================
  // 5. SAST Scans
  // ==========================================================================

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

  it("lists SAST scans and retries a failed SAST scan", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => [
          {
            id: "sast-scan-2",
            target_id: "t-1",
            profile: "sast-joern",
            status: "failed",
            created_at: "2026-09-01T00:00:00Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          id: "sast-scan-2",
          target_id: "t-1",
          profile: "sast-joern",
          status: "queued",
          created_at: "2026-09-01T00:00:00Z",
        }),
      });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-secret-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const list = await client.listSastScans({ profile: "sast-joern", status: "failed" });
    expect(list.length).toBe(1);

    const retried = await client.retrySastScan("sast-scan-2");
    expect(retried.status).toBe("queued");
  });

  // ==========================================================================
  // 6. Audit & Telemetry
  // ==========================================================================

  it("fetches audit events using admin auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => [
        {
          id: "audit-1",
          action: "target_created",
          resource_type: "target",
          resource_id: "t-1",
          detail: null,
          actor: "admin",
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-secret-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const events = await client.listAuditEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.action).toBe("target_created");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/v1/audit-events");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(
      "admin-secret-key",
    );
  });

  it("fetches platform stats across targets and scans", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        targets_count: 12,
        scans_count: 55,
        running_scans_count: 2,
        profile_breakdown: { recon: 30, "sast-joern": 25 },
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      apiKey: "operator-secret-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const stats = await client.getStats();
    expect(stats.targets_count).toBe(12);
    expect(stats.scans_count).toBe(55);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/v1/stats");
  });

  // ==========================================================================
  // 7. Internal Controller Protocol (HMAC)
  // ==========================================================================

  it("generates valid HMAC headers for controller endpoints", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({
        id: "scan-claimed-1",
        profile: "recon",
        target: "test.example.com",
        authorization_reference: "AUTH-1",
      }),
    });

    const secret = "super-shared-controller-secret";
    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      controllerSecret: secret,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const job = await client.claimControllerJob();
    expect(job).not.toBeNull();
    expect(job?.id).toBe("scan-claimed-1");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://test-orchestrator.local/v1/internal/controller/jobs/claim");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Controller-Timestamp"]).toBeDefined();
    expect(headers["X-Controller-Nonce"]).toBeDefined();
    expect(headers["X-Controller-Signature"]).toBeDefined();
  });

  it("completes and fails controller jobs with HMAC signatures", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          id: "res-comp-1",
          scan_job_id: "scan-comp-1",
          created_at: "2026-09-01T00:00:00Z",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          id: "scan-fail-1",
          target_id: "t-1",
          profile: "recon",
          status: "failed",
          failure_reason: "Worker node crashed",
          created_at: "2026-09-01T00:00:00Z",
        }),
      });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      controllerSecret: "ctrl-sec",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const completePayload: ControllerJobCompletePayload = {
      summary: {
        findings: [],
      },
    };
    await client.completeControllerJob("scan-comp-1", completePayload);

    const failPayload: ControllerJobFailPayload = {
      reason: "Worker node crashed",
    };
    const failedScan = await client.failControllerJob("scan-fail-1", failPayload);
    expect(failedScan.status).toBe("failed");
  });

  // ==========================================================================
  // 8. Error Handling & Validation Parsing
  // ==========================================================================

  it("throws OrchestratorApiError on 404 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => "application/json" },
      json: async () => ({
        error: {
          type: "not_found",
          detail: "Target target-999 was not found",
          status: 404,
        },
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(client.getTarget("target-999")).rejects.toThrow(
      "Target target-999 was not found",
    );
  });

  it("parses unified validation_error format with status 422", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: { get: () => "application/json" },
      json: async () => ({
        error: {
          type: "validation_error",
          detail: [
            {
              loc: ["body", "value"],
              msg: "String should have at least 1 characters",
              type: "string_too_short",
            },
          ],
          status: 422,
        },
      }),
    });

    const client = new ScanOrchestratorClient({
      baseUrl: "https://test-orchestrator.local",
      adminApiKey: "admin-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await client.registerTarget({
        value: "",
        owner_reference: "Sec",
        authorization_reference: "A-1",
        authorization_confirmed: true,
      });
      expect.unreachable("Should have thrown 422 error");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(OrchestratorApiError);
      const apiErr = err as OrchestratorApiError;
      expect(apiErr.statusCode).toBe(422);
      expect(apiErr.message).toContain("value: String should have at least 1 characters");
    }
  });
});
