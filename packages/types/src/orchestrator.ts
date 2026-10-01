import type { FetchLike } from "./logger.js";

export type ScanProfile =
  | "recon"
  | "web-discovery"
  | "network-portscan"
  | "fast-portscan"
  | "smart-portscan"
  | "content-discovery"
  | "deep-content-discovery"
  | "web-crawl"
  | "vuln-assessment"
  | "xss-scan"
  | "dast-zap"
  | "oob-interaction"
  | "dns-recon"
  | "subdomain-takeover"
  | "waf-detect"
  | "cors-audit"
  | "crlf-scan"
  | "ssti-scan";

export type SastProfile =
  | "sast-joern"
  | "sast-semgrep"
  | "sast-trufflehog"
  | "sast-codeql"
  | "sast-gitleaks"
  | "sast-bandit";

export type AllScanProfile = ScanProfile | SastProfile;

/**
 * The 3-Tier Security Architecture:
 * - "local-offline": 100% offline, in-editor AST & syntax analysis (zero internet required).
 * - "cloud-sast": Deep Joern CPG taint dataflow, Semgrep rules, and TruffleHog secrets (requires internet).
 * - "target-dast": Dynamic URL, open ports, and Nuclei vulnerability probing (requires internet & authorization).
 */
export type ScanModeTier = "local-offline" | "cloud-sast" | "target-dast";

export type ScanMode = ScanModeTier | "local" | "orchestrator";

export type ScanStatus =
  "queued" | "dispatching" | "running" | "completed" | "failed" | "cancelled";

export interface TargetCreate {
  value: string;
  owner_reference: string;
  authorization_reference: string;
  authorization_confirmed: boolean;
  target_type?: "network" | "source_code";
}

export interface TargetRead {
  id: string;
  value: string;
  created_at: string;
}

export interface ScanCreate {
  target_id: string;
  profile: ScanProfile;
}

export interface SASTScanCreate {
  target_id: string;
  profile?: SastProfile;
  rule_tags?: string[] | null;
}

export interface SastProfileEngine {
  profile: SastProfile;
  engine: string;
  languages: string[];
  capabilities: string[];
  purpose: string;
}

export interface SastProfilesResponse {
  sast_profiles: SastProfileEngine[];
}

export interface ScanRead {
  id: string;
  target_id: string;
  profile: string;
  status: ScanStatus;
  controller_job_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface ArtifactRead {
  id: string;
  sha256: string;
  byte_count: number;
  expires_at: string;
  deleted_at: string | null;
}

export interface SastFindingFlowStep {
  step: number;
  location: string;
  variable?: string;
  type: string;
}

export interface SastFindingEvidence {
  location?: string;
  file?: string;
  line?: number | null;
  column?: number | null;
  function?: string | null;
  snippet?: string | null;
  check_id?: string;
  cwe?: string[];
  owasp?: string[];
  detector?: string;
  verified?: boolean;
  redacted_secret?: string;
  extra_data?: {
    rotation_guide?: string;
    version?: string;
    [key: string]: unknown;
  };
  flow?: SastFindingFlowStep[];
  [key: string]: unknown;
}

export interface SastFindingSummary {
  id: string;
  code: string;
  severity: string;
  title: string;
  description: string;
  evidence?: SastFindingEvidence | string;
  remediation?: string;
  logs?: string;
}

export interface RemoteFindingSummary {
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info" | string;
  description?: string;
  host?: string;
  matched_at?: string;
  cwe?: string;
  reference?: string[];
  template_id?: string;
}

export interface ScanResultSummary {
  live_hosts_count?: number;
  scanned_files_count?: number;
  total_rules_evaluated?: number;
  risk_summary?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
    total?: number;
  };
  findings?: (RemoteFindingSummary | SastFindingSummary)[];
  status_codes?: Record<string, number>;
  web_servers?: string[];
  technologies?: string[];
  status?: string;
  [key: string]: unknown;
}

export interface ScanResultRead {
  id: string;
  scan_job_id: string;
  summary: ScanResultSummary;
  created_at: string;
  artifact: ArtifactRead | null;
  error_logs: string | null;
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export interface ListScansParams extends PaginationParams {
  status?: ScanStatus;
  profile?: string;
  target_id?: string;
}

export interface ListSastScansParams extends PaginationParams {
  status?: string;
  profile?: string;
  target_id?: string;
}

export interface HealthLiveResponse {
  status: string;
}

export interface HealthReadyResponse {
  status: "ready" | "not_ready" | string;
  database: "ok" | "unreachable" | string;
}

export interface PlatformStatsRead {
  targets_count: number;
  scans_count: number;
  results_count: number;
  scans_by_status: {
    completed?: number;
    failed?: number;
    running?: number;
    queued?: number;
    cancelled?: number;
    dispatching?: number;
    [status: string]: number | undefined;
  };
  scans_by_profile: Record<string, number>;
}

export interface ControllerJobClaim {
  id: string;
  target: string;
  profile: string;
  authorization_reference: string;
}

export interface ControllerJobCompletePayload {
  summary: {
    risk_summary?: {
      critical?: number;
      high?: number;
      medium?: number;
      low?: number;
      info?: number;
      total?: number;
      [key: string]: unknown;
    };
    findings?: Array<{
      id?: string;
      code?: string;
      severity?: string;
      title: string;
      description?: string;
      evidence?: unknown;
      remediation?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
}

export interface ControllerJobFailPayload {
  reason: string;
}

export interface ControllerJobStatus {
  id: string;
  status: string;
}

export interface ControllerHmacHeaders {
  "X-Controller-Timestamp": string;
  "X-Controller-Nonce": string;
  "X-Controller-Signature": string;
  "Content-Type": string;
}

export interface AuditEventRead {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  detail: string | null;
  created_at?: string;
}

export interface OrchestratorClientConfig {
  baseUrl?: string;
  apiKey?: string;
  adminApiKey?: string;
  authMode?: "api_key" | "bearer";
  jwtToken?: string;
  bearerToken?: string;
  controllerSecret?: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}
