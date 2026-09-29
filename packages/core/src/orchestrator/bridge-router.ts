import type { BridgeMessage, BridgeMessageType } from "@whoami/types";
import type { ScanOrchestratorClient } from "./client.js";

export const ORCHESTRATOR_REQUEST_TYPES: ReadonlySet<BridgeMessageType> = new Set([
  "register-target-request",
  "list-targets-request",
  "get-target-request",
  "submit-remote-scan-request",
  "list-scans-request",
  "get-remote-scan-request",
  "cancel-remote-scan-request",
  "retry-scan-request",
  "get-remote-scan-result-request",
  "list-audit-events-request",
  "get-platform-stats-request",
  "poll-remote-scan-request",
  "get-sast-profiles-request",
  "submit-sast-scan-request",
  "list-sast-scans-request",
  "get-sast-scan-request",
  "cancel-sast-scan-request",
  "retry-sast-scan-request",
  "get-sast-scan-result-request",
  "poll-remote-scans-request",
  "poll-sast-scan-request",
] satisfies BridgeMessageType[]);

/** True for the cloud orchestrator's `*-request` messages handled below. */
export function isOrchestratorRequest(message: BridgeMessage): boolean {
  return ORCHESTRATOR_REQUEST_TYPES.has(message.type);
}

/**
 * Host-agnostic dispatcher for the cloud orchestrator's `*-request`
 * BridgeMessages -- shared by the VS Code extension host and the Tauri
 * desktop app so the two can't drift apart. Each host only supplies its own
 * client (Node fetch vs. the Tauri http plugin's fetch) and `post`.
 *
 * `getClient` is only called for orchestrator requests, so a host whose
 * client is expensive to build (VS Code re-reads .env files, desktop reads
 * settings from IndexedDB) pays nothing for unrelated messages. It may be
 * async, and may throw (e.g. a disallowed URL) -- that surfaces like any
 * other request error.
 *
 * Returns `true` if `message` was an orchestrator request (and a reply was
 * posted), `false` if the caller should handle it itself. Errors propagate
 * unchanged: each host already maps thrown errors to its own `error`
 * BridgeMessage via `toStructuredError`, keeping the requestId.
 */
export async function handleOrchestratorMessage(
  getClient: () => ScanOrchestratorClient | Promise<ScanOrchestratorClient>,
  message: BridgeMessage,
  post: (message: BridgeMessage) => void,
): Promise<boolean> {
  if (!isOrchestratorRequest(message)) return false;
  const client = await getClient();
  const { requestId } = message;

  switch (message.type) {
    case "register-target-request": {
      const target = await client.registerTarget(message.target);
      post({ type: "register-target-result", target, requestId });
      return true;
    }
    case "list-targets-request": {
      const targets = await client.listTargets(message.params);
      post({ type: "list-targets-result", targets, requestId });
      return true;
    }
    case "get-target-request": {
      const target = await client.getTarget(message.targetId);
      post({ type: "get-target-result", target, requestId });
      return true;
    }
    case "submit-remote-scan-request": {
      const scan = await client.submitScan(message.scan, message.idempotencyKey);
      post({ type: "submit-remote-scan-result", scan, requestId });
      return true;
    }
    case "list-scans-request": {
      const scans = await client.listScans(message.params);
      post({ type: "list-scans-result", scans, requestId });
      return true;
    }
    case "get-remote-scan-request": {
      const scan = await client.getScan(message.scanId);
      post({ type: "get-remote-scan-result", scan, requestId });
      return true;
    }
    case "cancel-remote-scan-request": {
      const scan = await client.cancelScan(message.scanId);
      post({ type: "cancel-remote-scan-result", scan, requestId });
      return true;
    }
    case "retry-scan-request": {
      const scan = await client.retryScan(message.scanId);
      post({ type: "retry-scan-result", scan, requestId });
      return true;
    }
    case "get-remote-scan-result-request": {
      const result = await client.getScanResult(message.scanId);
      post({ type: "get-remote-scan-result-result", result, requestId });
      return true;
    }
    case "list-audit-events-request": {
      const events = await client.listAuditEvents();
      post({ type: "list-audit-events-result", events, requestId });
      return true;
    }
    case "get-platform-stats-request": {
      const stats = await client.getStats();
      post({ type: "get-platform-stats-result", stats, requestId });
      return true;
    }
    case "poll-remote-scan-request": {
      const { scan, result } = await client.pollScanUntilComplete(message.scanId);
      post({ type: "poll-remote-scan-result", scan, result, requestId });
      return true;
    }
    case "get-sast-profiles-request": {
      const profiles = await client.getSastProfiles();
      post({ type: "get-sast-profiles-result", profiles, requestId });
      return true;
    }
    case "submit-sast-scan-request": {
      const scan = await client.submitSastScan(message.scan, message.idempotencyKey);
      post({ type: "submit-sast-scan-result", scan, requestId });
      return true;
    }
    case "list-sast-scans-request": {
      const scans = await client.listSastScans(message.params);
      post({ type: "list-sast-scans-result", scans, requestId });
      return true;
    }
    case "get-sast-scan-request": {
      const scan = await client.getSastScan(message.scanId);
      post({ type: "get-sast-scan-result", scan, requestId });
      return true;
    }
    case "cancel-sast-scan-request": {
      const scan = await client.cancelSastScan(message.scanId);
      post({ type: "cancel-sast-scan-result", scan, requestId });
      return true;
    }
    case "retry-sast-scan-request": {
      const scan = await client.retrySastScan(message.scanId);
      post({ type: "retry-sast-scan-result", scan, requestId });
      return true;
    }
    case "get-sast-scan-result-request": {
      const result = await client.getSastScanResult(message.scanId);
      post({ type: "get-sast-scan-result-result", result, requestId });
      return true;
    }
    case "poll-remote-scans-request": {
      const results = await client.pollScansUntilComplete(message.scanIds, {
        kind: message.kind,
        targetId: message.targetId,
        onProgress: (scans) =>
          post({ type: "poll-remote-scans-progress", pollId: message.pollId, scans }),
      });
      post({ type: "poll-remote-scans-result", results, requestId });
      return true;
    }
    case "poll-sast-scan-request": {
      const { scan, result } = await client.pollSastScanUntilComplete(message.scanId);
      post({ type: "poll-sast-scan-result", scan, result, requestId });
      return true;
    }
    default:
      // Unreachable while ORCHESTRATOR_REQUEST_TYPES matches the cases above
      // (enforced by bridge-router.test.ts).
      return false;
  }
}
