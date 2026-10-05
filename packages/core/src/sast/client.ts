import type {
  SastCreateResponse,
  SastJobDetailResponse,
  SastPresignedUploadRequest,
  SastPresignedUploadResponse,
  SastScanDirectRequest,
  SastScanRepoRequest,
  SastToolCatalogResponse,
  SecurityStreamEvent,
} from "@whoami/types";
import { DEFAULT_SAST_SERVICE_URL } from "../orchestrator/constants.js";

export class SecurityServiceApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "SecurityServiceApiError";
  }
}

export interface SastClientOptions {
  readonly baseUrl?: string;
  readonly jwtToken?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface PollJobOptions {
  intervalMs?: number;
  maxIntervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (job: SastJobDetailResponse) => void;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "expired"]);

export class SastClient {
  private readonly baseUrl: string;
  private readonly jwtToken?: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SastClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_SAST_SERVICE_URL).replace(/\/+$/, "");
    this.jwtToken = options.jwtToken?.trim();
    this.apiKey = options.apiKey?.trim();
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  }

  private getAuthHeader(): Record<string, string> {
    const token = this.jwtToken || this.apiKey;
    if (!token) {
      throw new SecurityServiceApiError(
        "Authentication required: No JWT bearer token or API key configured for SAST service.",
        401,
      );
    }
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
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
          // Non-JSON error body
        }
        throw new SecurityServiceApiError(detail, res.status, detail);
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof SecurityServiceApiError) throw err;
      throw new SecurityServiceApiError(
        err instanceof Error ? err.message : "Network error contacting SAST service",
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getHealth(): Promise<{ status: string; environment?: string; version?: string }> {
    return this.request("/health", { method: "GET" }, false);
  }

  async getTools(): Promise<SastToolCatalogResponse> {
    return this.request("/v1/tools", { method: "GET" }, false);
  }

  async submitPassiveScan(
    zipData: Blob | Buffer | Uint8Array,
    filename = "source.zip",
  ): Promise<SastCreateResponse> {
    const formData = new FormData();
    const blob =
      zipData instanceof Blob
        ? zipData
        : new Blob([zipData as unknown as BlobPart]);
    formData.append("file", blob, filename);

    return this.request("/v1/sast/scan", {
      method: "POST",
      body: formData,
    });
  }

  async submitActiveScan(
    zipData: Blob | Buffer | Uint8Array,
    filename = "source.zip",
  ): Promise<SastCreateResponse> {
    const formData = new FormData();
    const blob =
      zipData instanceof Blob
        ? zipData
        : new Blob([zipData as unknown as BlobPart]);
    formData.append("file", blob, filename);

    return this.request("/v1/sast/scan/active", {
      method: "POST",
      body: formData,
    });
  }

  async requestUploadUrl(req: SastPresignedUploadRequest = {}): Promise<SastPresignedUploadResponse> {
    return this.request("/v1/sast/scan/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  async submitDirectScan(req: SastScanDirectRequest): Promise<SastCreateResponse> {
    return this.request("/v1/sast/scan/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  async submitRepoScan(req: SastScanRepoRequest): Promise<SastCreateResponse> {
    return this.request("/v1/sast/scan/repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  }

  async getJob(jobId: string): Promise<SastJobDetailResponse> {
    return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  }

  async deleteJob(jobId: string): Promise<{ message: string }> {
    return this.request(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  }

  async getAutofixPatch(jobId: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = new Headers(this.getAuthHeader());
      const res = await this.fetchImpl(`${this.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}/patch`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new SecurityServiceApiError(
          `Failed to fetch patch: status ${res.status}`,
          res.status,
        );
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
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
    options: PollJobOptions = {},
  ): Promise<SastJobDetailResponse> {
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
      `Timed out waiting for SAST job ${jobId} to complete after ${maxWaitMs}ms`,
      408,
    );
  }
}
