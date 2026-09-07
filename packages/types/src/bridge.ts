import type { Finding } from "./findings.js";
import type { WorkspaceGraph } from "./graph.js";
import type {
  AuditEventRead,
  SASTScanCreate,
  SastProfilesResponse,
  ScanCreate,
  ScanRead,
  ScanResultRead,
  TargetCreate,
  TargetRead,
} from "./orchestrator.js";
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
    })
  | (BaseMessage & {
      readonly type: "scan-workspace-progress";
      readonly scanned: number;
      readonly total: number;
    })
  | (BaseMessage & {
      readonly type: "scan-workspace-result";
      readonly findings: readonly Finding[];
    })
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
      readonly type: "submit-remote-scan-request";
      readonly scan: ScanCreate;
      readonly idempotencyKey?: string;
    })
  | (BaseMessage & {
      readonly type: "submit-remote-scan-result";
      readonly scan: ScanRead;
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
  | (BaseMessage & {
      readonly type: "poll-remote-scan-request";
      readonly scanId: string;
    })
  | (BaseMessage & {
      readonly type: "poll-remote-scan-result";
      readonly scan: ScanRead;
      readonly result?: ScanResultRead;
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
      readonly type: "error";
      readonly message: string;
      readonly code?: string;
      readonly scope?: string;
      readonly statusCode?: number;
      readonly reason?: string;
      readonly hint?: string;
      readonly fix?: string;
      readonly link?: string;
    });

export type BridgeMessageType = BridgeMessage["type"];
