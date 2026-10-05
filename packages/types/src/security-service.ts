/**
 * Contracts for Codefy SAST & DAST Microservices.
 * Unified via shared JWT authentication from cmd-d-llm Gateway.
 */

export type SastScanMode = "passive" | "active" | "diff" | "autofix" | "compliance";

export type SastScanStatus = "pending" | "running" | "completed" | "failed" | "expired";

export interface SastJobSummary {
  readonly total_findings: number;
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly info: number;
}

export interface SastFinding {
  readonly fingerprint: string;
  readonly tool_name: string;
  readonly vulnerability_id: string;
  readonly title: string;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | string;
  readonly file_path: string;
  readonly line_start: number;
  readonly line_end?: number | null;
  readonly snippet?: string | null;
  readonly description?: string | null;
  readonly cwe_id?: string | null;
  readonly remediation?: string | null;
  readonly detected_by: readonly string[];
  readonly terminal_output?: string | null;
}

export interface SastCreateResponse {
  readonly job_id: string;
  readonly mode: SastScanMode;
  readonly status: SastScanStatus;
  readonly status_url: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly message: string;
  readonly cached?: boolean;
}

export interface SastJobDetailResponse {
  readonly job_id: string;
  readonly user_id: string;
  readonly mode: SastScanMode;
  readonly status: SastScanStatus;
  readonly summary?: SastJobSummary | null;
  readonly created_at: string;
  readonly completed_at?: string | null;
  readonly expires_at: string;
  readonly duration_ms?: number | null;
  readonly error_message?: string | null;
  readonly terminal_output?: string | null;
  readonly tool_errors?: Record<string, string>;
  readonly findings: readonly SastFinding[];
  readonly scanned_tools: readonly string[];
  readonly autofix_patch?: string | null;
  readonly cached?: boolean;
}

export interface SastToolInfo {
  readonly id: string;
  readonly name: string;
  readonly modes: readonly SastScanMode[];
  readonly version: string;
  readonly category: string;
  readonly description: string;
}

export interface SastToolCatalogResponse {
  readonly tools: readonly SastToolInfo[];
}

export interface SastPresignedUploadRequest {
  readonly filename?: string;
  readonly content_type?: string;
}

export interface SastPresignedUploadResponse {
  readonly upload_url: string;
  readonly file_key: string;
  readonly provider: string;
  readonly expires_in_seconds: number;
}

export interface SastScanDirectRequest {
  readonly file_key: string;
  readonly file_sha256: string;
  readonly mode?: SastScanMode;
  readonly ruleset_version?: string;
  readonly base_commit?: string;
  readonly framework?: string | null;
  readonly enable_autofix?: boolean;
}

export interface SastScanRepoRequest {
  readonly repo_url: string;
  readonly branch?: string;
  readonly mode?: SastScanMode;
  readonly github_token?: string | null;
  readonly subpath?: string | null;
  readonly base_commit?: string;
  readonly framework?: string | null;
  readonly enable_autofix?: boolean;
}

// -------------------------------------------------------------
// DAST Microservice Contracts
// -------------------------------------------------------------

export type DastScanMode = "passive" | "active";

export type DastScanStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface DastScanRequest {
  readonly target_url: string;
  readonly mode?: DastScanMode;
  readonly tools?: readonly string[];
  readonly custom_headers?: Record<string, string>;
  readonly cookies?: Record<string, string>;
  readonly excluded_paths?: readonly string[];
  readonly crawl_depth?: number;
  readonly max_hosts?: number;
}

export interface DastScanResponse {
  readonly job_id: string;
  readonly target_url: string;
  readonly mode: DastScanMode;
  readonly status: DastScanStatus;
  readonly status_url: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly message: string;
  readonly selected_tools?: readonly string[];
}

export interface DastFinding {
  readonly id?: string;
  readonly tool_name: string;
  readonly rule_id?: string;
  readonly vulnerability_id?: string;
  readonly title: string;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | string;
  readonly cwe_id?: string | null;
  readonly owasp_category?: string | null;
  readonly cvss_score?: number | null;
  readonly target_url?: string;
  readonly file_path?: string;
  readonly line_start?: number;
  readonly snippet?: string | null;
  readonly parameter?: string | null;
  readonly evidence?: unknown;
  readonly remediation?: string | null;
  readonly fingerprint: string;
  readonly detected_by?: readonly string[];
  readonly corroborated_by?: readonly string[];
  readonly raw_output?: unknown;
}

export interface DastJobSummary {
  readonly total_findings: number;
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly info: number;
  readonly scanned_tools?: readonly string[];
  readonly duration_ms?: number;
}

export interface DastJobDetailResponse {
  readonly job_id: string;
  readonly user_id: string;
  readonly target_url?: string | null;
  readonly mode: string;
  readonly status: string;
  readonly summary?: DastJobSummary | Record<string, unknown> | null;
  readonly created_at: string;
  readonly completed_at?: string | null;
  readonly expires_at?: string | null;
  readonly duration_ms?: number | null;
  readonly error_message?: string | null;
  readonly terminal_output?: string | null;
  readonly tool_errors?: Record<string, string>;
  readonly findings: readonly DastFinding[];
  readonly scanned_tools: readonly string[];
}

export interface DastToolInfo {
  readonly id: string;
  readonly name: string;
  readonly modes?: readonly DastScanMode[];
  readonly category: string;
  readonly description: string;
}

export interface DastToolCatalogResponse {
  readonly total?: number;
  readonly tools: readonly DastToolInfo[];
}

export interface DastValidateTargetResponse {
  readonly ok: boolean;
  readonly target_url: string;
  readonly safe_to_scan: boolean;
  readonly hostname?: string;
  readonly ip_address?: string;
  readonly reason?: string;
}

// -------------------------------------------------------------
// Real-time SSE Stream Event
// -------------------------------------------------------------

export interface SecurityStreamEvent {
  readonly type: "ping" | "tool_start" | "tool_complete" | "scan_complete" | "error";
  readonly job_id?: string;
  readonly tool?: string;
  readonly status?: string;
  readonly findings_count?: number;
  readonly summary?: SastJobSummary | DastJobSummary;
  readonly timestamp?: number;
  readonly message?: string;
}
