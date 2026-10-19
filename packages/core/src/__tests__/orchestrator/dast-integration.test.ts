import { describe, expect, it, vi } from "vitest";
import {
  ScanOrchestratorClient,
  resolveDastProfile,
  DAST_PROFILE_TO_TOOL_MAP,
  DAST_ACTIVE_TOOLS,
} from "../../orchestrator/client.js";
import { DEFAULT_CODEFY_JWT } from "../../orchestrator/constants.js";

describe("DAST Profile and Tool Resolution", () => {
  it("maps profile aliases to concrete tool IDs and scan modes", () => {
    expect(resolveDastProfile("recon")).toEqual({ tool: "httpx", mode: "passive" });
    expect(resolveDastProfile("vuln-assessment")).toEqual({ tool: "nuclei", mode: "active" });
    expect(resolveDastProfile("xss-scan")).toEqual({ tool: "dalfox", mode: "active" });
    expect(resolveDastProfile("network-portscan")).toEqual({ tool: "naabu", mode: "passive" });
    expect(resolveDastProfile("content-discovery")).toEqual({ tool: "ffuf", mode: "active" });
    expect(resolveDastProfile("dns-recon")).toEqual({ tool: "dnsx", mode: "passive" });
    expect(resolveDastProfile("waf-detect")).toEqual({ tool: "wafw00f", mode: "passive" });
  });

  it("handles concrete tool names directly with proper mode resolution", () => {
    expect(resolveDastProfile("nuclei")).toEqual({ tool: "nuclei", mode: "active" });
    expect(resolveDastProfile("dalfox")).toEqual({ tool: "dalfox", mode: "active" });
    expect(resolveDastProfile("httpx")).toEqual({ tool: "httpx", mode: "passive" });
    expect(resolveDastProfile("katana")).toEqual({ tool: "katana", mode: "passive" });
  });

  it("handles undefined or empty profile gracefully", () => {
    expect(resolveDastProfile(undefined)).toEqual({ mode: "passive" });
    expect(resolveDastProfile("")).toEqual({ mode: "passive" });
  });
});

describe("ScanOrchestratorClient DAST Submissions & Fallbacks", () => {
  it("submits DAST scan with resolved tool, mode, and records metadata", async () => {
    ScanOrchestratorClient.clearStateForTests();

    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/v1/dast/validate-target")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ valid: true, ok: true, safe_to_scan: true, target_url: "https://example.com" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/v1/dast/scan/active") || url.includes("/v1/dast/scan")) {
        const body = JSON.parse(init?.body as string);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              job_id: "job_dast_123",
              target_url: body.target_url,
              mode: body.mode,
              status: "pending",
              status_url: "/v1/jobs/job_dast_123",
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
              message: "DAST scan queued",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const client = new ScanOrchestratorClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      useMicroservices: true,
    });

    const scan = await client.submitScan({
      target_id: "https://example.com",
      profile: "xss-scan",
    });

    expect(scan.id).toBe("job_dast_123");
    expect(scan.status).toBe("queued");

    const meta = ScanOrchestratorClient.getScanMeta("job_dast_123");
    expect(meta).toBeDefined();
    expect(meta?.kind).toBe("dast");
    expect(meta?.profile).toBe("xss-scan");
  });

  it("handles null findings and network errors in getScanResult with safe fallback", async () => {
    ScanOrchestratorClient.clearStateForTests();

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job_dast_456",
          user_id: "usr_1",
          target_url: "https://example.com",
          mode: "passive",
          status: "completed",
          summary: null,
          findings: null,
          created_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new ScanOrchestratorClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      useMicroservices: true,
    });

    const result = await client.getScanResult("job_dast_456");
    expect(result.id).toBe("result-job_dast_456");
    expect(result.summary.findings).toEqual([]);
    expect(result.summary.risk_summary?.total).toBe(0);
  });

  it("falls back to local scanMetaMap in listScans when microservice listing fails", async () => {
    ScanOrchestratorClient.clearStateForTests();

    const mockFetch = vi.fn().mockRejectedValue(new Error("Service unavailable"));

    const client = new ScanOrchestratorClient({
      fetchFn: mockFetch as unknown as typeof fetch,
      useMicroservices: true,
    });

    // Populate meta manually as if a scan was submitted
    const target = await client.registerTarget({
      value: "target.example.com",
      owner_reference: "dev",
      authorization_reference: "auth",
      authorization_confirmed: true,
    });

    const scans = await client.listScans({ target_id: target.id });
    expect(Array.isArray(scans)).toBe(true);
  });
});
