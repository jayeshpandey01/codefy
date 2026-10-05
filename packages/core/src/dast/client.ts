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
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DastClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_DAST_SERVICE_URL).replace(/\/+$/, "");
    this.jwtToken = options.jwtToken?.trim();
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  }

  private getAuthHeader(): Record<string, string> {
    if (!this.jwtToken) {
      throw new SecurityServiceApiError(
        "Authentication required: No JWT bearer token configured for DAST service.",
        401,
      );
    }
    return { Authorization: `Bearer ${this.jwtToken}` };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    requireAuth = true,
  ): Promise<T> {
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

      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });

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
      if (err instanceof SecurityServiceApiError) throw err;
      throw new SecurityServiceApiError(
        err instanceof Error ? err.message : "Network error contacting DAST service",
        0,
      );
    } finally {
      clearTimeout(timer);
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
    return this.request(
      `/v1/dast/validate-target?target_url=${encodeURIComponent(targetUrl)}`,
      { method: "GET" },
      true,
    );
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
