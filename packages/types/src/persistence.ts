import type { Finding } from "./findings.js";

/** Tab identifiers for the Settings & History modal */
export type SettingsModalTabId =
  | "account"
  | "engine"
  | "appearance"
  | "tips"
  | "history"
  | "about"
  | "plans";

/** Recent workspace project entry */
export interface WorkspaceEntry {
  readonly path: string;
  readonly name: string;
  readonly lastOpenedAt: number;
  readonly scanCount: number;
}

/** Record of a completed or running scan session in the database */
export interface ScanSessionEntry {
  readonly id: string;
  readonly workspacePath: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly mode: string;
  readonly findingsCount: number;
}

/** Scan session with its hydrated finding objects */
export interface ScanSessionWithFindings extends ScanSessionEntry {
  readonly findings: readonly Finding[];
}

/** User profile and API configuration persisted in local database */
export interface UserAccount {
  readonly name: string;
  readonly email: string;
  readonly tier: "community" | "pro" | "enterprise";
  readonly emailVerified?: boolean;
  readonly createdAt?: number;
  readonly lastLoginAt?: number;
  readonly apiKey?: string;
  readonly openRouterApiKey?: string;
  readonly customGatewayUrl?: string;
  readonly selectedAiModel?: string;
}

/**
 * Signed-in session against the hosted AI Gateway's own developer-account
 * system (`/developer/auth/*`) -- this is real account authentication, not
 * a locally-invented credential. Persisted locally so the app can restore
 * the session on relaunch; never contains the password itself, only the
 * server-issued bearer token.
 */
export interface AuthSession {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly tier: "community" | "pro" | "enterprise";
  /** Epoch ms after which the token should be treated as expired. */
  readonly expiresAt: number;
}

/** Toggles for individual static AST detection rules */
export interface RuleToggleConfig {
  readonly commandInjection: boolean; // CWE-78
  readonly sqlInjection: boolean; // CWE-89
  readonly ssrf: boolean; // CWE-918
  readonly pathTraversal: boolean; // CWE-22
  readonly codeInjection: boolean; // CWE-94
  readonly secretDetection: boolean; // Shannon entropy + regex patterns
}

/** Application preferences persisted in key-value store */
export interface UserSettings {
  readonly theme:
    | "dark"
    | "light"
    | "catppuccin"
    | "tokyo-night"
    | "dracula"
    | "ayu-dark"
    | "github-dark"
    | "atom-one-dark"
    | "night-owl"
    | "monokai-pro"
    | "one-dark-pro"
    | "solarized-light";

  readonly autoScanOnOpen: boolean;
  readonly defaultLayoutDirection: "DOWN" | "RIGHT";
  readonly defaultGraphTab:
    | "graph"
    | "unified"
    | "blast_radius"
    | "control_flow"
    | "supply_chain"
    | "remote";
  readonly graphViewMode: "all" | "selected";
  readonly defaultScanMode: string;
  readonly analysisPipelineMode: "bugs" | "full";

  // Scanner & Engine
  readonly rules: RuleToggleConfig;
  readonly customExcludedDirs: readonly string[];
  readonly maxScannableFiles: number;

  readonly selectedAiModel: string;

  // Telemetry & Storage
  readonly enableTelemetry: boolean;
  readonly maskAbsolutePaths: boolean;
  readonly maxScanHistory: number;
}

/** Static or dynamic security and AST usage tips */
export interface SecurityTip {
  readonly id: string;
  readonly category: "AST & Taint" | "Security Hygiene" | "Shortcuts" | "PoC Probing";
  readonly title: string;
  readonly summary: string;
  readonly codeSnippet?: string;
  readonly cwe?: string;
}

/** Plan tier details for the Plans tab */
export interface PlanTierInfo {
  readonly id: "community" | "pro" | "enterprise";
  readonly name: string;
  readonly tag: string;
  readonly price: string;
  readonly current: boolean;
  readonly features: readonly string[];
}

/** Developer API key managed by the user in the account section */
export interface DeveloperApiKey {
  readonly id: string;
  readonly keyName: string;
  readonly name?: string;
  readonly prefix: string;
  readonly createdAt: string | number;
  readonly expiresAt?: string | number;
  readonly status?: "active" | "revoked";
}

/** Usage and rate limit statistics from the gateway backend */
export interface UsageSummary {
  readonly totalRequests: number;
  readonly requestsToday: number;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly tierLimitRpd: number;
}

export interface PasswordResetRequest {
  readonly email: string;
  readonly language?: string;
}

export interface VerifyResetOtpRequest {
  readonly email: string;
  readonly code: string;
}

export interface ResetPasswordSubmit {
  readonly email: string;
  readonly code: string;
  readonly newPassword: string;
}

