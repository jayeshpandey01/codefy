import type { Finding } from "./findings.js";
import type { WorkspaceGraph } from "./graph.js";
import type {
  AuditEventRead,
  ListSastScansParams,
  ListScansParams,
  PaginationParams,
  PlatformStatsRead,
  SASTScanCreate,
  SastProfilesResponse,
  ScanCreate,
  ScanRead,
  ScanResultRead,
  TargetCreate,
  TargetRead,
} from "./orchestrator.js";
import type { AuthSession, DeveloperApiKey, RuleToggleConfig, UserAccount } from "./persistence.js";
import type { TaintTrace } from "./taint.js";

interface BaseMessage {
  /**
   * VS Code's postMessage is fire-and-forget in both directions, so any
   * message expecting a reply carries this for client-side correlation —
   * see the webview-bridge skill. Tauri's invoke gets request/response for
   * free but implements against the same BridgeMessage shape regardless.
   */
  readonly requestId?: string;
}

export type BridgeMessage =
  | (BaseMessage & {
      readonly type: "pick-folder-request";
      readonly defaultPath?: string;
    })
  | (BaseMessage & {
      readonly type: "pick-folder-result";
      readonly folderPath: string | null;
    })
  | (BaseMessage & {
      readonly type: "scan-workspace-request";
      readonly folderPath?: string;
      readonly rules?: RuleToggleConfig;
      readonly customExcludedDirs?: readonly string[];
      readonly maxScannableFiles?: number;
    })
  | (BaseMessage & {
      readonly type: "scan-workspace-progress";
      readonly scanned: number;
      readonly total: number;
    })
  | (BaseMessage & {
      readonly type: "scan-workspace-result";
      readonly findings: readonly Finding[];
      readonly coverage?: ScanCoverage;
    })
  | (BaseMessage & { readonly type: "auth-session-load-request" })
  | (BaseMessage & {
      readonly type: "auth-session-load-result";
      readonly session: AuthSession | null;
    })
  | (BaseMessage & {
      readonly type: "auth-session-save-request";
      readonly session: AuthSession;
    })
  | (BaseMessage & { readonly type: "auth-session-save-result" })
  | (BaseMessage & { readonly type: "auth-session-clear-request" })
  | (BaseMessage & { readonly type: "auth-session-clear-result" })
  | (BaseMessage & {
      readonly type: "get-trace-request";
      readonly findingId: string;
    })
  | (BaseMessage & {
      readonly type: "get-trace-result";
      readonly trace: TaintTrace;
    })
  | (BaseMessage & { readonly type: "get-workspace-graph-request" })
  | (BaseMessage & {
      readonly type: "get-workspace-graph-result";
      readonly graph: WorkspaceGraph;
    })
  | (BaseMessage & {
      readonly type: "apply-fix-request";
      readonly findingId: string;
    })
  | (BaseMessage & {
      readonly type: "apply-fix-result";
      readonly applied: boolean;
    })
  | (BaseMessage & {
      readonly type: "run-poc-request";
      readonly findingId: string;
    })
  | (BaseMessage & {
      readonly type: "run-poc-result";
      readonly verified: boolean;
      readonly detail: string;
    })
  | (BaseMessage & {
      readonly type: "jump-to-line";
      readonly filePath: string;
      readonly line: number;
    })
  | (BaseMessage & {
      readonly type: "register-target-request";
      readonly target: TargetCreate;
    })
  | (BaseMessage & {
      readonly type: "register-target-result";
      readonly target: TargetRead;
    })
  | (BaseMessage & {
      readonly type: "list-targets-request";
      readonly params?: PaginationParams;
    })
  | (BaseMessage & {
      readonly type: "list-targets-result";
      readonly targets: readonly TargetRead[];
    })
  | (BaseMessage & {
      readonly type: "get-target-request";
      readonly targetId: string;
    })
  | (BaseMessage & {
      readonly type: "get-target-result";
      readonly target: TargetRead;
    })
  | (BaseMessage & {
      readonly type: "submit-remote-scan-request";
      readonly scan: ScanCreate;
      readonly idempotencyKey?: string;
    })
  | (BaseMessage & {
      readonly type: "submit-remote-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "list-scans-request";
      readonly params?: ListScansParams;
    })
  | (BaseMessage & {
      readonly type: "list-scans-result";
      readonly scans: readonly ScanRead[];
    })
  | (BaseMessage & {
      readonly type: "get-remote-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "get-remote-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "cancel-remote-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "cancel-remote-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "retry-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "retry-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "get-remote-scan-result-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "get-remote-scan-result-result";
      readonly result: ScanResultRead;
    })
  | (BaseMessage & { readonly type: "list-audit-events-request" })
  | (BaseMessage & {
      readonly type: "list-audit-events-result";
      readonly events: readonly AuditEventRead[];
    })
  | (BaseMessage & { readonly type: "get-platform-stats-request" })
  | (BaseMessage & {
      readonly type: "get-platform-stats-result";
      readonly stats: PlatformStatsRead;
    })
  | (BaseMessage & {
      readonly type: "poll-remote-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "poll-remote-scan-result";
      readonly scan: ScanRead;
      readonly result?: ScanResultRead;
    })
  | (BaseMessage & {
      /** Poll several scans of one run (all DAST or all SAST) until all are terminal. */
      readonly type: "poll-remote-scans-request";
      readonly scanIds: readonly string[];
      readonly kind: "dast" | "sast";
      /** Lets the host poll the whole run with one list request per tick. */
      readonly targetId?: string;
      /**
       * Correlates poll-remote-scans-progress events. Deliberately separate from
       * requestId: a message carrying the requestId resolves the pending request.
       */
      readonly pollId: string;
    })
  | (BaseMessage & {
      readonly type: "poll-remote-scans-progress";
      readonly pollId: string;
      readonly scans: readonly ScanRead[];
    })
  | (BaseMessage & {
      readonly type: "poll-remote-scans-result";
      readonly results: readonly {
        readonly scan: ScanRead;
        readonly result?: ScanResultRead;
      }[];
    })
  | (BaseMessage & { readonly type: "get-sast-profiles-request" })
  | (BaseMessage & {
      readonly type: "get-sast-profiles-result";
      readonly profiles: SastProfilesResponse;
    })
  | (BaseMessage & {
      readonly type: "submit-sast-scan-request";
      readonly scan: SASTScanCreate;
      readonly idempotencyKey?: string;
    })
  | (BaseMessage & {
      readonly type: "submit-sast-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "list-sast-scans-request";
      readonly params?: ListSastScansParams;
    })
  | (BaseMessage & {
      readonly type: "list-sast-scans-result";
      readonly scans: readonly ScanRead[];
    })
  | (BaseMessage & {
      readonly type: "get-sast-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "get-sast-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "cancel-sast-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "cancel-sast-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "retry-sast-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "retry-sast-scan-result";
      readonly scan: ScanRead;
    })
  | (BaseMessage & {
      readonly type: "get-sast-scan-result-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "get-sast-scan-result-result";
      readonly result: ScanResultRead;
    })
  | (BaseMessage & {
      readonly type: "poll-sast-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "poll-sast-scan-result";
      readonly scan: ScanRead;
      readonly result?: ScanResultRead;
    })
  | (BaseMessage & {
      readonly type: "import-remote-findings";
      readonly findings: readonly Finding[];
    })
  | (BaseMessage & {
      readonly type: "auth-login-request";
      readonly email: string;
      readonly password: string;
    })
  | (BaseMessage & {
      readonly type: "auth-login-result";
      readonly session: AuthSession;
    })
  | (BaseMessage & {
      readonly type: "auth-register-request";
      readonly name: string;
      readonly email: string;
      readonly password: string;
    })
  | (BaseMessage & {
      readonly type: "auth-register-result";
      readonly status: "authenticated" | "pending_verification";
      readonly email: string;
      readonly session?: AuthSession;
    })
  | (BaseMessage & {
      readonly type: "auth-verify-email-request";
      readonly email: string;
      readonly code: string;
    })
  | (BaseMessage & {
      readonly type: "auth-verify-email-result";
      readonly session: AuthSession;
    })
  | (BaseMessage & {
      readonly type: "auth-resend-code-request";
      readonly email: string;
    })
  | (BaseMessage & { readonly type: "auth-resend-code-result" })
  | (BaseMessage & {
      readonly type: "auth-forgot-password-request";
      readonly email: string;
    })
  | (BaseMessage & {
      readonly type: "auth-forgot-password-result";
      readonly ok: boolean;
    })
  | (BaseMessage & {
      readonly type: "auth-verify-reset-otp-request";
      readonly email: string;
      readonly code: string;
    })
  | (BaseMessage & {
      readonly type: "auth-verify-reset-otp-result";
      readonly ok: boolean;
    })
  | (BaseMessage & {
      readonly type: "auth-reset-password-request";
      readonly email: string;
      readonly code: string;
      readonly newPassword: string;
    })
  | (BaseMessage & {
      readonly type: "auth-reset-password-result";
      readonly ok: boolean;
    })
  | (BaseMessage & {
      readonly type: "auth-list-api-keys-request";
      readonly token: string;
    })
  | (BaseMessage & {
      readonly type: "auth-list-api-keys-result";
      readonly keys: readonly DeveloperApiKey[];
    })
  | (BaseMessage & {
      readonly type: "auth-create-api-key-request";
      readonly token: string;
      readonly name: string;
      readonly expiresDays?: number;
    })
  | (BaseMessage & {
      readonly type: "auth-create-api-key-result";
      readonly key: { readonly key: string; readonly name: string; readonly id: string };
    })
  | (BaseMessage & {
      readonly type: "auth-revoke-api-key-request";
      readonly token: string;
      readonly keyId: string;
    })
  | (BaseMessage & {
      readonly type: "auth-revoke-api-key-result";
      readonly ok: boolean;
    })
  | (BaseMessage & {
      readonly type: "auth-get-profile-request";
      readonly token: string;
    })
  | (BaseMessage & {
      readonly type: "auth-get-profile-result";
      readonly profile: UserAccount;
    })
  | (BaseMessage & { readonly type: "persistence-load-request" })
  | (BaseMessage & {
      readonly type: "persistence-load-result";
      /** Whole persisted blob as last saved, or null if nothing saved yet
       * (first run) -- see apps/vscode-extension/src/db/database.ts, the
       * extension-host-backed counterpart to the desktop app's IndexedDB
       * database.ts. Shape is owned entirely by that db layer, not by the
       * bridge protocol itself. */
      readonly data: unknown;
    })
  | (BaseMessage & {
      readonly type: "persistence-save-request";
      /** Fire-and-forget -- no persistence-save-result. The webview holds
       * the authoritative in-memory copy already; this just flushes it to
       * context.globalState so it survives the extension host restarting. */
      readonly data: unknown;
    })
  | (BaseMessage & {
      readonly type: "save-report-file-request";
      readonly fileName: string;
      readonly content: string;
      readonly encoding?: "utf-8" | "base64";
      readonly mimeType?: string;
    })
  | (BaseMessage & {
      readonly type: "save-report-file-result";
      readonly savedPath: string | null;
    })
  | (BaseMessage & {
      readonly type: "error";
      readonly message: string;
      readonly code?: string;
      readonly scope?: string;
      readonly statusCode?: number;
      readonly reason?: string;
      readonly hint?: string;
      readonly fix?: string;
      readonly link?: string;
    })
  | (BaseMessage & {
      readonly type: "update-notice";
      readonly notice: UpdateNotice;
    })
  | (BaseMessage & { readonly type: "update-install-request" })
  | (BaseMessage & { readonly type: "update-restart-request" })
  | (BaseMessage & {
      readonly type: "update-dismiss-request";
      readonly version: string;
    });

export type BridgeMessageType = BridgeMessage["type"];

/** Filesystem and parser coverage for one local workspace scan. */
export interface ScanCoverage {
  readonly filesDiscovered: number;
  readonly filesScanned: number;
  readonly filesFailed: number;
  readonly filesSkippedLarge: number;
  readonly filesSkippedUnsupported: number;
  readonly directoriesSkipped: number;
  readonly directoriesUnreadable: number;
  readonly fileLimitReached: boolean;
}

/**
 * host -> ui, carried by an "update-notice" BridgeMessage. See
 * docs/RELEASE-PIPELINE.md for the flow this drives: the desktop host emits
 * "available" -> "progress" -> "ready" (or "error") around an
 * update:install/update:restart round trip with the user; both hosts emit
 * "updated" once, right after a version bump they detect on their own side
 * (the Tauri updater plugin for desktop, context.globalState for the
 * extension). packages/ui renders all five kinds from one <UpdateBanner>,
 * with no host-specific branching.
 */
export type UpdateNotice =
  | { readonly kind: "available"; readonly version: string; readonly notes: string }
  | { readonly kind: "progress"; readonly downloaded: number; readonly total?: number }
  | { readonly kind: "ready"; readonly version: string }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "updated";
      readonly from: string;
      readonly to: string;
      readonly notes: string;
    };
