import {
  type AuditEventRead,
  type OrchestratorClientConfig,
  type SASTScanCreate,
  type SastProfilesResponse,
  type ScanCreate,
  type ScanRead,
  type ScanResultRead,
  type TargetCreate,
  type TargetRead,
  VercelError,
} from "@whoami/types";
import { Logger } from "../logging/logger.js";

export const DEFAULT_ORCHESTRATOR_URL = "https://axiom-xjkc.onrender.com";

export interface PollScanOptions {
  intervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (scan: ScanRead) => void;
}

export interface OrchestratorErrorMeta {
  code?: string;
  reason?: string;
  hint?: string;
  fix?: string;
  link?: string;
}

export class OrchestratorApiError extends VercelError {
  public readonly responseBody: unknown;

  constructor(
    message: string,
    statusCode: number,
    responseBody: unknown,
    options?: OrchestratorErrorMeta,
  ) {
    super(message, {
      code:
        options?.code ??
        (statusCode > 0 ? `http_${statusCode}` : "network_error"),
      scope: "orchestrator",
      statusCode: statusCode > 0 ? statusCode : 500,
      reason: options?.reason,
      hint: options?.hint,
      fix: options?.fix,
      link: options?.link ?? DEFAULT_ORCHESTRATOR_URL,
    });
    this.name = "OrchestratorApiError";
    this.responseBody = responseBody;
  }
}

/**
 * Sanitizes user input into a plain hostname or IP address without URL scheme, port, or path,
 * as strictly required by the Orchestrator API (/v1/targets).
 */
export function sanitizeTargetHostname(raw: string): string {
  if (!raw) return "target.internal";
  let cleaned = raw.trim();
  // Strip protocol scheme (http://, https://, ws://, wss://, etc.)
  cleaned = cleaned.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i, "");
  // Strip paths, query strings, and hashes
  cleaned = cleaned.replace(/[/?#].*$/, "");
  // Strip port if present (e.g. :8080) when not an IPv6 bracketed address
  if (!cleaned.includes("]") && cleaned.includes(":") && !cleaned.startsWith("[")) {
    const parts = cleaned.split(":");
    if (parts[0]) cleaned = parts[0];
  }
  return cleaned.trim() || "target.internal";
}

export class ScanOrchestratorClient {
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly adminApiKey?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly logger: Logger;

  constructor(config: OrchestratorClientConfig & { logger?: Logger } = {}) {
    this.baseUrl = (config.baseUrl || DEFAULT_ORCHESTRATOR_URL).replace(
      /\/+$/,
      "",
    );
    this.apiKey =
      config.apiKey ||
      (typeof process !== "undefined" ? process.env?.["API_KEY"] : undefined) ||
      "Jf2T0sTy0IauJ6ELjLWAibC9-EpFo5LXwneztTBeyAU";
    this.adminApiKey =
      config.adminApiKey ||
      (typeof process !== "undefined"
        ? process.env?.["ADMIN_API_KEY"]
        : undefined) ||
      "nBK_0V8AQVDZmC6gTpgkTn04t7Gx2IYSYiPvdT5zymU";
    this.fetchFn =
      (config.fetchFn as typeof fetch) ||
      (typeof fetch !== "undefined"
        ? fetch
        : (undefined as unknown as typeof fetch));
    this.timeoutMs = config.timeoutMs || 30000;
    this.logger = (
      config.logger || new Logger({ source: "orchestrator-client" })
    ).child("orchestrator-client");
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      headers?: Record<string, string>;
      auth?: "admin" | "operator" | "none";
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    if (!this.fetchFn) {
      throw new VercelError(
        "[ScanOrchestratorClient] No fetch implementation available in current environment",
        {
          code: "missing_fetch",
          scope: "orchestrator",
          hint: "Provide a custom fetchFn in configuration or ensure global fetch is available.",
        },
      );
    }

    const method = options.method || "GET";
    const authType = options.auth ?? "operator";
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    if (authType === "admin") {
      const key = this.adminApiKey || this.apiKey;
      if (key) {
        headers["X-API-Key"] = key;
      }
    } else if (authType === "operator") {
      const key = this.apiKey || this.adminApiKey;
      if (key) {
        headers["X-API-Key"] = key;
      }
    }

    this.logger.debug(`API Request: ${method} ${path}`, {
      authType,
      hasBody: options.body !== undefined,
    });

    const startTime = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        body:
          options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `API Request Network Failure: ${method} ${path}`,
        err instanceof Error ? err : new Error(errMsg),
        { durationMs },
      );
      throw new OrchestratorApiError(
        `Network error communicating with Orchestrator: ${errMsg}`,
        0,
        null,
        {
          code: "network_error",
          reason: `Failed to establish connection to ${this.baseUrl}${path}`,
          hint: `Ensure ${this.baseUrl} is reachable and your network is connected.`,
          fix: "Check ORCHESTRATOR_URL in .env or VS Code settings.",
        },
      );
    }

    const durationMs = Date.now() - startTime;
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    let responseData: unknown;
    if (isJson) {
      try {
        responseData = await response.json();
      } catch {
        responseData = null;
      }
    } else {
      responseData = await response.text();
    }

    if (!response.ok) {
      let errorMessage = `Orchestrator request failed with status ${response.status}`;
      if (responseData && typeof responseData === "object") {
        const obj = responseData as Record<string, unknown>;
        if ("detail" in obj) {
          if (typeof obj["detail"] === "string") {
            errorMessage = obj["detail"];
          } else if (Array.isArray(obj["detail"])) {
            errorMessage = obj["detail"]
              .map((d: unknown) => {
                if (d && typeof d === "object") {
                  const dObj = d as Record<string, unknown>;
                  const loc = Array.isArray(dObj["loc"])
                    ? dObj["loc"].join(".")
                    : "";
                  const msg =
                    typeof dObj["msg"] === "string" ? dObj["msg"] : "";
                  return loc ? `${loc}: ${msg}` : msg;
                }
                return String(d);
              })
              .join(", ");
          }
        }
      }

      this.logger.warn(
        `API Error Response: ${method} ${path} -> ${response.status}`,
        {
          statusCode: response.status,
          error: errorMessage,
          durationMs,
        },
      );

      let meta: OrchestratorErrorMeta = {};
      if (response.status === 401 || response.status === 403) {
        meta = {
          code: "auth_failed",
          reason:
            "API key was missing, invalid, or has insufficient role permissions for this endpoint.",
          hint: "Verify API_KEY or ADMIN_API_KEY in your .env or VS Code settings.",
          fix: "Set a valid API Key in settings.",
        };
      } else if (response.status === 404) {
        meta = {
          code: "not_found",
          reason:
            "The requested target or scan was not found on the Orchestrator.",
          hint: "Ensure the target/scan ID exists before performing this operation.",
        };
      } else if (response.status === 409) {
        meta = {
          code: "conflict",
          reason:
            "Scan is currently running or cannot be transitioned to the requested state.",
          hint: "Wait for the scan job to complete before requesting results.",
        };
      } else if (response.status === 422) {
        meta = {
          code: "validation_error",
          reason: errorMessage,
          hint: "Target value must be a valid domain or IP, and profile must match an allowed profile.",
          fix: "Check input format (e.g. example.com) and try again.",
        };
      } else if (response.status === 429) {
        meta = {
          code: "rate_limited",
          reason:
            "Rate limit (60 requests/minute) exceeded on the Orchestrator service.",
          hint: "Back off and wait a few moments before retrying.",
          fix: "Slow down request polling rate.",
        };
      } else if (response.status >= 500) {
        meta = {
          code: "server_error",
          reason: "Orchestrator server encountered an internal error.",
          hint: "Check server logs or try again later.",
        };
      }

      throw new OrchestratorApiError(
        errorMessage,
        response.status,
        responseData,
        meta,
      );
    }

    this.logger.debug(`API Success: ${method} ${path} -> ${response.status}`, {
      durationMs,
    });
    return responseData as T;
  }

  /**
   * Health check
   */
  async getHealth(): Promise<{ status: string }> {
    return this.request<{ status: string }>("/health", { auth: "none" });
  }

  /**
   * Register a new authorized target (Admin required)
   */
  async registerTarget(target: TargetCreate): Promise<TargetRead> {
    const sanitizedTarget: TargetCreate = {
      ...target,
      value: sanitizeTargetHostname(target.value),
    };
    return this.request<TargetRead>("/v1/targets", {
      method: "POST",
      body: sanitizedTarget,
      auth: "admin",
    });
  }

  /**
   * Queue a new scan job for an authorized target (Operator / Admin)
   */
  async submitScan(
    scan: ScanCreate,
    idempotencyKey?: string,
  ): Promise<ScanRead> {
    return this.request<ScanRead>("/v1/scans", {
      method: "POST",
      body: scan,
      idempotencyKey,
      auth: "operator",
    });
  }

  /**
   * Retrieve the status of a scan job
   */
  async getScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(`/v1/scans/${scanId}`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Request cancellation of a queued or running scan job
   */
  async cancelScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(`/v1/scans/${scanId}/cancel`, {
      method: "POST",
      auth: "operator",
    });
  }

  /**
   * Get the parsed results, summary, and artifacts of a completed/failed scan
   */
  async getScanResult(scanId: string): Promise<ScanResultRead> {
    return this.request<ScanResultRead>(`/v1/scans/${scanId}/result`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * List recent system audit events (Admin required)
   */
  async listAuditEvents(): Promise<AuditEventRead[]> {
    return this.request<AuditEventRead[]>("/v1/audit-events", {
      method: "GET",
      auth: "admin",
    });
  }

  /**
   * Polls a scan job until it reaches a terminal status ('completed', 'failed', 'cancelled')
   * and optionally fetches the final scan result.
   */
  async pollScanUntilComplete(
    scanId: string,
    options: PollScanOptions = {},
  ): Promise<{ scan: ScanRead; result?: ScanResultRead }> {
    const intervalMs = options.intervalMs || 2000;
    const maxWaitMs = options.maxWaitMs || 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const scan = await this.getScan(scanId);
      options.onProgress?.(scan);

      if (scan.status === "completed") {
        const result = await this.getScanResult(scanId);
        return { scan, result };
      }

      if (scan.status === "failed" || scan.status === "cancelled") {
        let result: ScanResultRead | undefined;
        try {
          result = await this.getScanResult(scanId);
        } catch {
          // If no result object was persisted for failure/cancellation, that is acceptable
        }
        return { scan, result };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new VercelError(
      `[ScanOrchestratorClient] Timed out waiting for scan ${scanId} after ${maxWaitMs}ms`,
      {
        code: "scan_timeout",
        scope: "orchestrator",
        reason: `Scan job ${scanId} remained in non-terminal state after ${maxWaitMs}ms`,
        hint: "The scan might still be running in the worker daemon or stuck in the queue.",
        fix: "Retry polling with a higher maxWaitMs or check controller logs.",
        link: DEFAULT_ORCHESTRATOR_URL,
      },
    );
  }

  /**
   * List available SAST profiles, engines, language capabilities, and query bundles.
   * Public endpoint (no authentication required).
   */
  async getSastProfiles(): Promise<SastProfilesResponse> {
    return this.request<SastProfilesResponse>("/v1/sast/profiles", {
      method: "GET",
      auth: "none",
    });
  }

  /**
   * Queue a new SAST code analysis job (Joern CPG, Semgrep, or TruffleHog)
   */
  async submitSastScan(
    scan: SASTScanCreate,
    idempotencyKey?: string,
  ): Promise<ScanRead> {
    return this.request<ScanRead>("/v1/sast/scans", {
      method: "POST",
      body: scan,
      idempotencyKey,
      auth: "operator",
    });
  }

  /**
   * Retrieve the status of a SAST scan job
   */
  async getSastScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(`/v1/sast/scans/${scanId}`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Request cancellation of a queued or running SAST scan job
   */
  async cancelSastScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(`/v1/sast/scans/${scanId}/cancel`, {
      method: "POST",
      auth: "operator",
    });
  }

  /**
   * Get the parsed results, summary, and findings of a completed/failed SAST scan
   */
  async getSastScanResult(scanId: string): Promise<ScanResultRead> {
    return this.request<ScanResultRead>(`/v1/sast/scans/${scanId}/result`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Polls a SAST scan job until it reaches a terminal status ('completed', 'failed', 'cancelled')
   * and optionally fetches the final scan result.
   */
  async pollSastScanUntilComplete(
    scanId: string,
    options: PollScanOptions = {},
  ): Promise<{ scan: ScanRead; result?: ScanResultRead }> {
    const intervalMs = options.intervalMs || 2000;
    const maxWaitMs = options.maxWaitMs || 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const scan = await this.getSastScan(scanId);
      options.onProgress?.(scan);

      if (scan.status === "completed") {
        const result = await this.getSastScanResult(scanId);
        return { scan, result };
      }

      if (scan.status === "failed" || scan.status === "cancelled") {
        let result: ScanResultRead | undefined;
        try {
          result = await this.getSastScanResult(scanId);
        } catch {
          // If no result object was persisted for failure/cancellation, that is acceptable
        }
        return { scan, result };
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new VercelError(
      `[ScanOrchestratorClient] Timed out waiting for SAST scan ${scanId} after ${maxWaitMs}ms`,
      {
        code: "scan_timeout",
        scope: "orchestrator",
        reason: `SAST scan job ${scanId} remained in non-terminal state after ${maxWaitMs}ms`,
        hint: "The scan might still be running in the worker daemon or stuck in the queue.",
        fix: "Retry polling with a higher maxWaitMs or check controller logs.",
        link: DEFAULT_ORCHESTRATOR_URL,
      },
    );
  }
}
