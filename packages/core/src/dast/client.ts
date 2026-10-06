import type {
  DastJobDetailResponse,
  DastScanRequest,
  DastScanResponse,
  DastToolCatalogResponse,
  DastValidateTargetResponse,
} from "@whoami/types";
import { DEFAULT_DAST_SERVICE_URL } from "../orchestrator/constants.js";
import { SecurityServiceApiError } from "../sast/client.js";

export interface DastClientOptions {
  readonly baseUrl?: string;
  readonly jwtToken?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface PollDastJobOptions {
  intervalMs?: number;
  maxIntervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (job: DastJobDetailResponse) => void;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

export class DastClient {
  private readonly baseUrl: string;
  private readonly jwtToken?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DastClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_DAST_SERVICE_URL).replace(/\/+$/, "");
    this.jwtToken = options.jwtToken?.trim();
    this.apiKey = options.apiKey?.trim();
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  }

  private getAuthHeader(): Record<string, string> {
    const token = this.jwtToken || this.apiKey;
    if (!token) {
      throw new SecurityServiceApiError(
        "Authentication required: No JWT bearer token or API key configured for DAST service.",
        401,
      );
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  private async executeFetch(
    url: string,
    init: RequestInit,
    requireAuth: boolean,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(init.headers || {});
      if (requireAuth) {
        const authHeader = this.getAuthHeader();
        for (const [k, v] of Object.entries(authHeader)) {
          headers.set(k, v);
        }
      }

      return await this.fetchImpl(url, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    requireAuth = true,
  ): Promise<T> {
    try {
      const res = await this.executeFetch(`${this.baseUrl}${path}`, init, requireAuth);

      if (!res.ok) {
        let detail = `Request failed with status ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson && typeof errJson === "object" && "detail" in errJson) {
            detail = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // Non-JSON response
        }
        throw new SecurityServiceApiError(detail, res.status, detail);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof SecurityServiceApiError) {
        throw err;
      }

      throw new SecurityServiceApiError(
        err instanceof Error ? err.message : "Network error contacting DAST service",
        0,
      );
    }
  }

  async getHealth(): Promise<{ status: string; environment?: string; version?: string }> {
    return this.request("/health", { method: "GET" }, false);
  }

  async getTools(): Promise<DastToolCatalogResponse> {
    return this.request("/v1/dast/tools", { method: "GET" }, false);
  }

  /**
   * Pre-flight SSRF Guardrail validation.
   * Asserts the target does not resolve to private/loopback/cloud metadata address space.
   */
  async validateTarget(targetUrl: string): Promise<DastValidateTargetResponse> {
    const raw = await this.request<Record<string, unknown>>(
      `/v1/dast/validate-target?target_url=${encodeURIComponent(targetUrl)}`,
      { method: "GET" },
      true,
    );
    const valid =
      typeof raw.valid === "boolean"
        ? raw.valid
        : typeof raw.ok === "boolean"
          ? raw.ok
          : Boolean(raw.safe_to_scan);

    return {
      valid,
      ok: valid,
      safe_to_scan: valid,
      target_url: (raw.target_url as string) || targetUrl,
      hostname: raw.hostname as string | undefined,
      resolved_ips: raw.resolved_ips as readonly string[] | undefined,
      ip_address: raw.ip_address as string | undefined,
      message: raw.message as string | undefined,
      code: raw.code as string | undefined,
      reason: (raw.reason as string) || (raw.message as string) || undefined,
    };
  }

  async submitScan(req: DastScanRequest): Promise<DastScanResponse> {
    return this.request("/v1/dast/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  async getJob(jobId: string): Promise<DastJobDetailResponse> {
    return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  }

  async deleteJob(jobId: string): Promise<{ message: string }> {
    return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  }

  async exportFindings(jobId: string, format: "sarif" | "json" = "sarif"): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(this.getAuthHeader());
      const res = await this.fetchImpl(
        `${this.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}/export?format=${encodeURIComponent(format)}`,
        {
          method: "GET",
          headers,
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        throw new SecurityServiceApiError(
          `Export failed with status ${res.status}`,
          res.status,
        );
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async pollJobUntilComplete(
    jobId: string,
    options: PollDastJobOptions = {},
  ): Promise<DastJobDetailResponse> {
    const intervalMs = options.intervalMs ?? 3000;
    const maxIntervalMs = options.maxIntervalMs ?? 15000;
    const maxWaitMs = options.maxWaitMs ?? 40 * 60 * 1000;
    const startTime = Date.now();

    let currentInterval = intervalMs;

    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getJob(jobId);
      options.onProgress?.(job);

      if (TERMINAL_STATUSES.has(job.status)) {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, currentInterval));
      currentInterval = Math.min(Math.round(currentInterval * 1.3), maxIntervalMs);
    }

    throw new SecurityServiceApiError(
      `Timed out waiting for DAST job ${jobId} to complete after ${maxWaitMs}ms`,
      408,
    );
  }
}
