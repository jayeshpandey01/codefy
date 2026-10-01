import {
  type AuditEventRead,
  type ControllerJobClaim,
  type ControllerJobCompletePayload,
  type ControllerJobFailPayload,
  type ControllerJobStatus,
  type HealthLiveResponse,
  type HealthReadyResponse,
  type ListSastScansParams,
  type ListScansParams,
  type OrchestratorClientConfig,
  type PaginationParams,
  type PlatformStatsRead,
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
import {
  DEFAULT_ORCHESTRATOR_URL,
  DEFAULT_OPERATOR_API_KEY,
  DEFAULT_ADMIN_API_KEY,
} from "./constants.js";
import { generateControllerHmacHeaders } from "./hmac.js";

export { DEFAULT_ORCHESTRATOR_URL, DEFAULT_OPERATOR_API_KEY, DEFAULT_ADMIN_API_KEY };

export interface PollScanOptions {
  /** Initial poll interval; polling backs off from here while nothing changes. */
  intervalMs?: number;
  /** Ceiling for the backed-off poll interval. */
  maxIntervalMs?: number;
  maxWaitMs?: number;
  onProgress?: (scan: ScanRead) => void;
}

export interface PollScansOptions extends Omit<PollScanOptions, "onProgress"> {
  kind?: "dast" | "sast";
  /**
   * When every polled scan belongs to this target, one list request per tick
   * covers all of them instead of one status request per scan.
   */
  targetId?: string;
  onProgress?: (scans: readonly ScanRead[]) => void;
}

export interface PolledScan {
  scan: ScanRead;
  result?: ScanResultRead;
}

const TERMINAL_SCAN_STATUSES = new Set(["completed", "failed", "cancelled"]);

/**
 * The backend now guarantees every scan reaches a terminal state: scanner
 * subprocesses time out at <=30 min (profiles.py), and a controller that dies
 * mid-scan has its heartbeat lease expire within ~4 min (app/worker.py). So the
 * client can wait out the longest legitimate scan instead of abandoning a
 * still-running nuclei/ZAP job at 10 min.
 */
export const DEFAULT_POLL_MAX_WAIT_MS = 40 * 60 * 1000;

/** Consecutive transient poll failures tolerated before giving up. */
const MAX_CONSECUTIVE_POLL_ERRORS = 8;

function isTransientOrchestratorError(err: unknown): err is OrchestratorApiError {
  if (!(err instanceof OrchestratorApiError)) return false;
  if (
    err.code === "rate_limited" ||
    err.code === "request_timeout" ||
    err.code === "network_error"
  ) {
    return true;
  }
  // 502/503/504: Render returns these while the API restarts during a deploy.
  return err.statusCode === 502 || err.statusCode === 503 || err.statusCode === 504;
}

function withJitter(ms: number): number {
  // ±20% so many pollers don't fire in lockstep.
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  /** From a 429's Retry-After header, when the server sent one. */
  public retryAfterMs?: number;

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

export function cleanCredential(val?: string | null): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim().replace(/^["']|["']$/g, "").trim();
  if (
    !trimmed ||
    trimmed === "undefined" ||
    trimmed === "null" ||
    trimmed === "none" ||
    trimmed === "YOUR_API_KEY" ||
    trimmed === "<YOUR_API_KEY>" ||
    trimmed === "<OPERATOR_OR_ADMIN_API_KEY>"
  ) {
    return undefined;
  }
  return trimmed;
}

/**
 * Sanitizes user input into a plain hostname or IP address without URL scheme, port, or path,
 * as strictly required by the Orchestrator API (/v1/targets).
 */
export function sanitizeTargetHostname(raw: string): string {
  if (!raw) return "scan-target.example.com";
  let cleaned = raw.trim();
  // Strip protocol scheme (http://, https://, ws://, etc.)
  cleaned = cleaned.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i, "");
  // Strip paths, query strings, and hashes
  cleaned = cleaned.replace(/[/?#].*$/, "");
  // Strip port if present (e.g. :8080) when not an IPv6 bracketed address
  if (!cleaned.includes("]") && cleaned.includes(":") && !cleaned.startsWith("[")) {
    const parts = cleaned.split(":");
    if (parts[0]) cleaned = parts[0];
  }
  cleaned = cleaned.trim();
  if (!cleaned || cleaned.endsWith(".internal") || cleaned === "localhost") {
    return "scan-target.example.com";
  }
  return cleaned;
}

/**
 * Builds a query string from key-value pairs, omitting undefined and null entries.
 */
export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export class ScanOrchestratorClient {
  public readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly adminApiKey?: string;
  private readonly authMode: "api_key" | "bearer";
  private readonly jwtToken?: string;
  private readonly controllerSecret?: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly logger: Logger;

  constructor(config: OrchestratorClientConfig & { logger?: Logger } = {}) {
    const rawUrl = config.baseUrl || DEFAULT_ORCHESTRATOR_URL;
    this.baseUrl = cleanCredential(rawUrl)?.replace(/\/+$/, "") || DEFAULT_ORCHESTRATOR_URL;

    this.apiKey = cleanCredential(config.apiKey);
    this.adminApiKey = cleanCredential(config.adminApiKey);

    this.authMode = config.authMode || "api_key";
    this.jwtToken = cleanCredential(config.jwtToken || config.bearerToken);

    this.controllerSecret = cleanCredential(config.controllerSecret);

    // Bind the global fetch: in a browser/webview it's branded to its global,
    // so calling it as `this.fetchFn(...)` throws "Illegal invocation" (same
    // fix as GatewayAuthClient's constructor).
    this.fetchFn =
      (config.fetchFn as typeof fetch) ||
      (typeof fetch !== "undefined"
        ? fetch.bind(globalThis)
        : (undefined as unknown as typeof fetch));

    // Render's free/hobby tier spins the service down after inactivity and takes
    // 30-50s to cold-start on the next request, so a 30s timeout aborts client-side
    // right as the server would have responded. 60s comfortably covers cold starts
    // while still callable with a shorter config.timeoutMs when the caller knows better.
    this.timeoutMs = config.timeoutMs || 60000;
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
      auth?: "admin" | "operator" | "controller" | "none";
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

    if (options.body !== undefined && options.body !== null) {
      headers["Content-Type"] = "application/json";
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    // Attach credentials according to endpoint role requirements
    if (authType === "admin") {
      const key = this.adminApiKey || this.apiKey;
      if (key && this.authMode === "api_key") {
        headers["X-API-Key"] = key;
        if (this.adminApiKey) {
          headers["X-Admin-API-Key"] = this.adminApiKey;
        }
      } else if (this.jwtToken && this.jwtToken !== "offline-local-session") {
        headers["Authorization"] = `Bearer ${this.jwtToken}`;
      } else if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      } else {
        throw new OrchestratorApiError(
          "An administrator account is required for this operation",
          401,
          null,
          {
            code: "admin_auth_missing",
            reason: "The signed-in account is missing administrator permissions.",
            hint: "Sign in with an administrator-enabled account or contact your Axiom administrator.",
            fix: "Use an account with the required role.",
          },
        );
      }
    } else if (authType === "operator") {
      const key = this.apiKey || this.adminApiKey;
      if (key && this.authMode === "api_key") {
        headers["X-API-Key"] = key;
        if (this.adminApiKey) {
          headers["X-Admin-API-Key"] = this.adminApiKey;
        }
      } else if (this.jwtToken && this.jwtToken !== "offline-local-session") {
        headers["Authorization"] = `Bearer ${this.jwtToken}`;
      } else if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      } else {
        throw new OrchestratorApiError(
          "Sign in to use cloud scans",
          401,
          null,
          {
            code: "auth_missing",
            reason: "No valid signed-in user session is available.",
            hint: "Sign in again to refresh your cloud-scan authorization.",
            fix: "Sign in to your WhoAmI account.",
          },
        );
      }
    } else if (authType === "controller") {
      if (!this.controllerSecret) {
        throw new OrchestratorApiError(
          "Controller authentication required but no CONTROLLER_SHARED_SECRET configured",
          401,
          null,
          {
            code: "controller_secret_missing",
            reason: "Controller HMAC shared secret is missing.",
            hint: "Provide controllerSecret in client configuration or set CONTROLLER_SHARED_SECRET.",
            fix: "Configure CONTROLLER_SHARED_SECRET in .env or worker settings.",
          },
        );
      }
      const controllerHeaders = generateControllerHmacHeaders({
        method,
        path,
        body: options.body,
        secret: this.controllerSecret,
      });
      Object.assign(headers, controllerHeaders);
    }

    this.logger.debug(`API Request: ${method} ${path}`, {
      url,
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
          options.body !== undefined && options.body !== null
            ? typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body)
            : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);
      const isTimeout =
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError");

      this.logger.error(
        `API Request Network Failure: ${method} ${path}`,
        err instanceof Error ? err : new Error(errMsg),
        { durationMs, isTimeout },
      );

      if (isTimeout) {
        throw new OrchestratorApiError(
          `Timed out waiting for Orchestrator response after ${this.timeoutMs}ms: ${method} ${path}`,
          0,
          null,
          {
            code: "request_timeout",
            reason: `${this.baseUrl} did not respond within ${this.timeoutMs}ms. Free-tier deployments spin down when idle and can take up to a minute to cold-start on the next request.`,
            hint: "If the service was idle, the first request after a while wakes it up but can still time out — retry once.",
            fix: "Retry the request, or raise timeoutMs in the orchestrator client config if this happens consistently on a warm service.",
          },
        );
      }

      throw new OrchestratorApiError(
        `Network error communicating with Orchestrator: ${errMsg}`,
        0,
        null,
        {
          code: "network_error",
          reason: `Failed to establish connection to ${this.baseUrl}${path}`,
          hint: `Ensure ${this.baseUrl} is reachable and your network is connected.`,
          fix: "Check ORCHESTRATOR_URL in .env or settings.",
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
      let errorType = "api_error";

      if (responseData && typeof responseData === "object") {
        const obj = responseData as Record<string, unknown>;

        // Check unified error envelope: { error: { type, detail, status } }
        if (obj["error"] && typeof obj["error"] === "object") {
          const errEnv = obj["error"] as Record<string, unknown>;
          if (typeof errEnv["type"] === "string") {
            errorType = errEnv["type"];
          }
          if (typeof errEnv["detail"] === "string") {
            errorMessage = errEnv["detail"];
          } else if (Array.isArray(errEnv["detail"])) {
            errorMessage = this.formatDetailArray(errEnv["detail"]);
          }
        } else if ("detail" in obj) {
          // Standard FastAPI fallback: { detail: ... }
          if (typeof obj["detail"] === "string") {
            errorMessage = obj["detail"];
          } else if (Array.isArray(obj["detail"])) {
            errorMessage = this.formatDetailArray(obj["detail"]);
          }
        }
      }

      this.logger.warn(
        `API Error Response: ${method} ${path} -> ${response.status}`,
        {
          url,
          authType,
          statusCode: response.status,
          error: errorMessage,
          errorType,
          durationMs,
        },
      );

      let meta: OrchestratorErrorMeta = {};
      if (response.status === 401 || response.status === 403) {
        meta = {
          code: "auth_failed",
          reason: "The signed-in account was not authorized for this operation.",
          hint: "Sign in with an account that has access to this target and operation.",
          fix: "Check the account's Axiom role and target authorization.",
        };
      } else if (response.status === 404) {
        meta = {
          code: "not_found",
          reason: "The requested resource was not found on the Orchestrator.",
          hint: "Ensure the ID exists before performing this operation.",
        };
      } else if (response.status === 409) {
        meta = {
          code: "conflict",
          reason:
            "Resource is currently in an incompatible state for the requested operation.",
          hint: "Wait for the scan job to finish or check job status.",
        };
      } else if (response.status === 422 || errorType === "validation_error") {
        meta = {
          code: "validation_error",
          reason: errorMessage,
          hint: "Payload validation failed on required fields or constraints.",
          fix: "Check input format against API specifications.",
        };
      } else if (response.status === 429) {
        meta = {
          code: "rate_limited",
          reason:
            "Rate limit (60 requests/minute) exceeded on the Orchestrator service.",
          hint: "Back off and wait a few moments before retrying.",
          fix: "Slow down request polling rate.",
        };
      }

      const apiError = new OrchestratorApiError(
        errorMessage,
        response.status,
        responseData,
        meta,
      );
      if (response.status === 429) {
        const retryAfterSec = Number.parseInt(
          response.headers?.get?.("retry-after") ?? "",
          10,
        );
        if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
          apiError.retryAfterMs = retryAfterSec * 1000;
        }
      }
      throw apiError;
    }

    this.logger.debug(
      `API Success Response: ${method} ${path} -> ${response.status}`,
      { durationMs },
    );

    return responseData as T;
  }

  private formatDetailArray(details: unknown[]): string {
    return details
      .map((d: unknown) => {
        if (d && typeof d === "object") {
          const dObj = d as Record<string, unknown>;
          const loc = Array.isArray(dObj["loc"])
            ? dObj["loc"].filter((x) => x !== "body").join(".")
            : "";
          const msg = typeof dObj["msg"] === "string" ? dObj["msg"] : "";
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(d);
      })
      .filter(Boolean)
      .join("; ");
  }

  // ============================================================================
  // 1. Health & Operational Endpoints (Public)
  // ============================================================================

  /**
   * Basic Health Check (GET /health)
   */
  async getHealth(): Promise<{ status: string; service: string }> {
    return this.request<{ status: string; service: string }>("/health", {
      auth: "none",
    });
  }

  /**
   * Kubernetes Liveness Probe (GET /health/live)
   */
  async getLiveness(): Promise<HealthLiveResponse> {
    return this.request<HealthLiveResponse>("/health/live", { auth: "none" });
  }

  /**
   * Kubernetes / System Readiness Probe (GET /health/ready)
   */
  async getReadiness(): Promise<HealthReadyResponse> {
    return this.request<HealthReadyResponse>("/health/ready", { auth: "none" });
  }

  // ============================================================================
  // 2. Target Management Endpoints (user-owned targets; admin can manage all)
  // ============================================================================

  /**
   * Register a new authorized target (POST /v1/targets)
   */
  async registerTarget(target: TargetCreate): Promise<TargetRead> {
    const isSourceCode =
      target.target_type === "source_code" ||
      target.value.startsWith("/") ||
      target.value.includes("\\") ||
      target.value.startsWith("git@") ||
      (target.value.startsWith("https://") && target.value.includes("github.com"));

    const targetPayload: TargetCreate = {
      ...target,
      target_type: isSourceCode ? "source_code" : (target.target_type || "network"),
      value: isSourceCode ? target.value.trim() : sanitizeTargetHostname(target.value),
    };
    return this.request<TargetRead>("/v1/targets", {
      method: "POST",
      body: targetPayload,
      auth: "admin",
    });
  }

  /**
   * List Registered Targets with pagination (GET /v1/targets)
   */
  async listTargets(params?: PaginationParams): Promise<TargetRead[]> {
    const qs = buildQueryString(params as Record<string, unknown>);
    return this.request<TargetRead[]>(`/v1/targets${qs}`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Get Target Details by target ID (GET /v1/targets/{target_id})
   */
  async getTarget(targetId: string): Promise<TargetRead> {
    return this.request<TargetRead>(`/v1/targets/${encodeURIComponent(targetId)}`, {
      method: "GET",
      auth: "operator",
    });
  }

  // ============================================================================
  // 3. DAST Scans (Dynamic Application Security Testing)
  // ============================================================================

  /**
   * Queue a new DAST scan job (POST /v1/scans)
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
   * List DAST scans with optional filters & pagination (GET /v1/scans)
   */
  async listScans(params?: ListScansParams): Promise<ScanRead[]> {
    const qs = buildQueryString(params as Record<string, unknown>);
    return this.request<ScanRead[]>(`/v1/scans${qs}`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Retrieve the status of a DAST scan job (GET /v1/scans/{scan_id})
   */
  async getScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(`/v1/scans/${encodeURIComponent(scanId)}`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Request cancellation of a queued or running DAST scan job (POST /v1/scans/{scan_id}/cancel)
   */
  async cancelScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(
      `/v1/scans/${encodeURIComponent(scanId)}/cancel`,
      {
        method: "POST",
        auth: "operator",
      },
    );
  }

  /**
   * Retry a failed or cancelled DAST scan job (POST /v1/scans/{scan_id}/retry)
   */
  async retryScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(
      `/v1/scans/${encodeURIComponent(scanId)}/retry`,
      {
        method: "POST",
        auth: "operator",
      },
    );
  }

  /**
   * Get the parsed results, summary, and artifacts of a DAST scan (GET /v1/scans/{scan_id}/result)
   */
  async getScanResult(scanId: string): Promise<ScanResultRead> {
    return this.request<ScanResultRead>(
      `/v1/scans/${encodeURIComponent(scanId)}/result`,
      {
        method: "GET",
        auth: "operator",
      },
    );
  }

  /**
   * Polls a DAST scan job until it reaches a terminal status ('completed', 'failed', 'cancelled')
   */
  async pollScanUntilComplete(
    scanId: string,
    options: PollScanOptions = {},
  ): Promise<{ scan: ScanRead; result?: ScanResultRead }> {
    const [polled] = await this.pollScansUntilComplete([scanId], {
      ...options,
      kind: "dast",
      onProgress: (scans) => {
        if (scans[0]) options.onProgress?.(scans[0]);
      },
    });
    return polled!;
  }

  /**
   * Polls several scans (all DAST or all SAST) until every one is terminal, and
   * fetches each result once. Compared with polling each scan in its own loop:
   * - one list request per tick covers every scan of a run when `targetId` is given;
   * - the interval backs off (x1.5, jittered, capped) while no status changes,
   *   and snaps back to `intervalMs` when one does;
   * - rate limiting (honouring Retry-After), timeouts, network errors and
   *   deploy-time 502/503/504s are retried instead of aborting the whole run.
   * Results are returned in `scanIds` order.
   */
  async pollScansUntilComplete(
    scanIds: readonly string[],
    options: PollScansOptions = {},
  ): Promise<PolledScan[]> {
    const kind = options.kind ?? "dast";
    const baseIntervalMs = options.intervalMs || 2000;
    const maxIntervalMs = Math.max(options.maxIntervalMs || 10000, baseIntervalMs);
    const maxWaitMs = options.maxWaitMs || DEFAULT_POLL_MAX_WAIT_MS;
    const startTime = Date.now();

    const latest = new Map<string, ScanRead>();
    const finished = new Map<string, PolledScan>();
    let intervalMs = baseIntervalMs;
    let consecutiveErrors = 0;

    while (Date.now() - startTime < maxWaitMs) {
      let waitMs = intervalMs;
      try {
        const pending = scanIds.filter((id) => !finished.has(id));
        const scans = await this.fetchScanStatuses(pending, kind, options.targetId);
        consecutiveErrors = 0;

        let changed = false;
        for (const scan of scans) {
          if (latest.get(scan.id)?.status !== scan.status) changed = true;
          latest.set(scan.id, scan);
        }
        options.onProgress?.(
          scanIds.flatMap((id) => {
            const scan = latest.get(id);
            return scan ? [scan] : [];
          }),
        );

        for (const scan of scans) {
          if (TERMINAL_SCAN_STATUSES.has(scan.status)) {
            finished.set(scan.id, { scan, result: await this.fetchTerminalResult(scan, kind) });
          }
        }
        if (finished.size === scanIds.length) {
          return scanIds.map((id) => finished.get(id)!);
        }

        intervalMs = changed ? baseIntervalMs : Math.min(intervalMs * 1.5, maxIntervalMs);
        waitMs = intervalMs;
      } catch (err) {
        consecutiveErrors += 1;
        if (!isTransientOrchestratorError(err) || consecutiveErrors > MAX_CONSECUTIVE_POLL_ERRORS) {
          throw err;
        }
        intervalMs = Math.min(intervalMs * 2, maxIntervalMs);
        waitMs = Math.max(err.retryAfterMs ?? 0, intervalMs);
        this.logger.warn(
          `Transient orchestrator error while polling (${err.code}); retrying in ~${waitMs}ms`,
        );
      }
      await sleep(withJitter(waitMs));
    }

    const unfinished = scanIds.filter((id) => !finished.has(id));
    const label = kind === "sast" ? "SAST scan" : "scan";
    throw new VercelError(
      `[ScanOrchestratorClient] Timed out waiting for ${label} ${unfinished.join(", ")} after ${maxWaitMs}ms`,
      {
        code: "scan_timeout",
        scope: "orchestrator",
        reason: `${label} job(s) ${unfinished.join(", ")} remained in non-terminal state after ${maxWaitMs}ms`,
        hint: "The scan might still be running, or a backend deployment/restart interrupted it mid-scan without reporting failure in time -- retrying usually resolves this.",
        fix: "Retry polling with a higher maxWaitMs or check controller logs.",
        link: DEFAULT_ORCHESTRATOR_URL,
      },
    );
  }

  private async fetchScanStatuses(
    scanIds: readonly string[],
    kind: "dast" | "sast",
    targetId?: string,
  ): Promise<ScanRead[]> {
    const getOne = (id: string) => (kind === "sast" ? this.getSastScan(id) : this.getScan(id));
    if (!targetId || scanIds.length < 2) {
      const scans: ScanRead[] = [];
      for (const id of scanIds) scans.push(await getOne(id));
      return scans;
    }
    const params = { target_id: targetId, limit: 200 };
    const listed = kind === "sast" ? await this.listSastScans(params) : await this.listScans(params);
    const wanted = new Set(scanIds);
    const scans = listed.filter((scan) => wanted.has(scan.id));
    // Anything the list didn't return (e.g. pushed past the page by newer scans on
    // the same target) is still fetched individually, so no scan is ever dropped.
    const seen = new Set(scans.map((scan) => scan.id));
    for (const id of scanIds) {
      if (!seen.has(id)) scans.push(await getOne(id));
    }
    return scans;
  }

  private async fetchTerminalResult(
    scan: ScanRead,
    kind: "dast" | "sast",
  ): Promise<ScanResultRead | undefined> {
    const getResult = (id: string) =>
      kind === "sast" ? this.getSastScanResult(id) : this.getScanResult(id);
    if (scan.status === "completed") return getResult(scan.id);
    try {
      return await getResult(scan.id);
    } catch {
      // No result object is persisted for most failures/cancellations -- acceptable.
      return undefined;
    }
  }

  // ============================================================================
  // 4. SAST Scans (Static Application Security Testing)
  // ============================================================================

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
   * Queue a new SAST code analysis job (POST /v1/sast/scans)
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
   * List SAST scans with optional filters & pagination (GET /v1/sast/scans)
   */
  async listSastScans(params?: ListSastScansParams): Promise<ScanRead[]> {
    const qs = buildQueryString(params as Record<string, unknown>);
    return this.request<ScanRead[]>(`/v1/sast/scans${qs}`, {
      method: "GET",
      auth: "operator",
    });
  }

  /**
   * Retrieve the status of a SAST scan job (GET /v1/sast/scans/{scan_id})
   */
  async getSastScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(
      `/v1/sast/scans/${encodeURIComponent(scanId)}`,
      {
        method: "GET",
        auth: "operator",
      },
    );
  }

  /**
   * Request cancellation of a queued or running SAST scan job (POST /v1/sast/scans/{scan_id}/cancel)
   */
  async cancelSastScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(
      `/v1/sast/scans/${encodeURIComponent(scanId)}/cancel`,
      {
        method: "POST",
        auth: "operator",
      },
    );
  }

  /**
   * Retry a failed or cancelled SAST scan job (POST /v1/sast/scans/{scan_id}/retry)
   */
  async retrySastScan(scanId: string): Promise<ScanRead> {
    return this.request<ScanRead>(
      `/v1/sast/scans/${encodeURIComponent(scanId)}/retry`,
      {
        method: "POST",
        auth: "operator",
      },
    );
  }

  /**
   * Get the parsed results, summary, and findings of a SAST scan (GET /v1/sast/scans/{scan_id}/result)
   */
  async getSastScanResult(scanId: string): Promise<ScanResultRead> {
    return this.request<ScanResultRead>(
      `/v1/sast/scans/${encodeURIComponent(scanId)}/result`,
      {
        method: "GET",
        auth: "operator",
      },
    );
  }

  /**
   * Polls a SAST scan job until it reaches a terminal status ('completed', 'failed', 'cancelled')
   * and optionally fetches the final scan result.
   */
  async pollSastScanUntilComplete(
    scanId: string,
    options: PollScanOptions = {},
  ): Promise<{ scan: ScanRead; result?: ScanResultRead }> {
    const [polled] = await this.pollScansUntilComplete([scanId], {
      ...options,
      kind: "sast",
      onProgress: (scans) => {
        if (scans[0]) options.onProgress?.(scans[0]);
      },
    });
    return polled!;
  }

  // ============================================================================
  // 5. Audit & Compliance Endpoints (Admin Required)
  // ============================================================================

  /**
   * List recent security audit events (GET /v1/audit-events)
   */
  async listAuditEvents(): Promise<AuditEventRead[]> {
    return this.request<AuditEventRead[]>("/v1/audit-events", {
      method: "GET",
      auth: "admin",
    });
  }

  // ============================================================================
  // 6. Dashboard & Statistics Endpoints (Operator / Admin)
  // ============================================================================

  /**
   * Get Platform Dashboard Statistics across targets, scans, and profiles (GET /v1/stats)
   */
  async getStats(): Promise<PlatformStatsRead> {
    return this.request<PlatformStatsRead>("/v1/stats", {
      method: "GET",
      auth: "operator",
    });
  }

  // ============================================================================
  // 7. Internal Controller Protocol (Private HMAC)
  // ============================================================================

  /**
   * Claim next queued job from the orchestrator (POST /v1/internal/controller/jobs/claim)
   */
  async claimControllerJob(): Promise<ControllerJobClaim | null> {
    return this.request<ControllerJobClaim | null>(
      "/v1/internal/controller/jobs/claim",
      {
        method: "POST",
        body: null,
        auth: "controller",
      },
    );
  }

  /**
   * Report controller job completion with findings and risk summary (POST /v1/internal/controller/jobs/{scan_id}/complete)
   */
  async completeControllerJob(
    scanId: string,
    payload: ControllerJobCompletePayload,
  ): Promise<ScanResultRead> {
    return this.request<ScanResultRead>(
      `/v1/internal/controller/jobs/${encodeURIComponent(scanId)}/complete`,
      {
        method: "POST",
        body: payload,
        auth: "controller",
      },
    );
  }

  /**
   * Report controller job failure with descriptive reason (POST /v1/internal/controller/jobs/{scan_id}/fail)
   */
  async failControllerJob(
    scanId: string,
    payload: ControllerJobFailPayload,
  ): Promise<ScanRead> {
    return this.request<ScanRead>(
      `/v1/internal/controller/jobs/${encodeURIComponent(scanId)}/fail`,
      {
        method: "POST",
        body: payload,
        auth: "controller",
      },
    );
  }

  /**
   * Query status of a controller job (GET /v1/internal/controller/jobs/{scan_id}/status)
   */
  async getControllerJobStatus(scanId: string): Promise<ControllerJobStatus> {
    return this.request<ControllerJobStatus>(
      `/v1/internal/controller/jobs/${encodeURIComponent(scanId)}/status`,
      {
        method: "GET",
        auth: "controller",
      },
    );
  }
}
