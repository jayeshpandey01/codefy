import type { BridgeClient, BridgeMessageOfType } from "@whoami/ui";
import type {
  BridgeMessage,
  BridgeMessageType,
  Finding,
  WorkspaceGraph,
} from "@whoami/types";
import { pickAndReadWorkspace, pickWorkspaceFolder, readWorkspaceFromPath, type PickedWorkspace } from "./workspaceFs.js";
import { scanFilesInWorker } from "./engineWorker.js";

type Handler = (message: BridgeMessage) => void;

let requestCounter = 0;
function nextRequestId(): string {
  requestCounter += 1;
  return `desktop-req-${requestCounter}-${Date.now()}`;
}

/**
 * The desktop app's concrete BridgeClient (see the webview-bridge skill and
 * packages/ui's BridgeClient interface). This is the ONLY place in the app
 * that talks to Tauri's dialog/fs plugins -- always from the main thread,
 * never from inside the analysis Worker (see engine.worker.ts's module doc).
 *
 * Because this app has no real separate "host" process the way the VS Code
 * extension does (there is no extension-host <-> webview split here -- this
 * class *is* the frontend's entire host-side implementation, running in the
 * same JS realm as the UI), `send()` handles messages synchronously-ish
 * in-process rather than posting across an IPC boundary. It still implements
 * exactly the same BridgeClient contract packages/ui expects, so the UI
 * layer never knows the difference from the VS Code build.
 */
export class TauriBridgeClient implements BridgeClient {
  private readonly handlers = new Map<BridgeMessageType, Set<Handler>>();
  private readonly anyHandlers = new Set<Handler>();

  /**
   * Findings from the most recently completed scan, keyed by id -- lets
   * get-trace-request answer immediately from memory instead of re-running
   * anything, since Finding already carries its full TaintTrace (see the
   * webview-bridge skill's rule on sending large payloads whole).
   */
  private lastScanFindings = new Map<string, Finding>();

  /** Built once per scan, alongside it, in the Worker (see engine.worker.ts) —
   * answers get-workspace-graph-request from memory rather than re-scanning. */
  private lastWorkspaceGraph: WorkspaceGraph = { nodes: [], edges: [] };

  send(message: BridgeMessage): void {
    void this.handle(message);
  }

  on<T extends BridgeMessageType>(
    type: T,
    handler: (message: BridgeMessageOfType<T>) => void,
  ): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler as Handler);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as Handler);
    };
  }

  /**
   * Correct only for single-reply message types (get-trace, apply-fix,
   * run-poc): it resolves on the first message matching `requestId`,
   * regardless of type. scan-workspace-request deliberately is NOT sent via
   * request() for that exact reason -- it streams scan-workspace-progress
   * messages under the same requestId before the final
   * scan-workspace-result, which would resolve this prematurely. Callers
   * should use send() + on('scan-workspace-progress'/'scan-workspace-result')
   * for that one instead (see the webview-bridge skill's streaming row).
   */
  async request<TReq extends BridgeMessage, TRes extends BridgeMessage>(
    message: TReq,
    timeoutMs = 30_000,
  ): Promise<TRes> {
    const requestId = message.requestId ?? nextRequestId();
    const outgoing = { ...message, requestId } as TReq;

    return new Promise<TRes>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.anyHandlers.delete(handler);
      };

      const handler: Handler = (incoming) => {
        if (incoming.requestId !== requestId) return;
        cleanup();
        resolve(incoming as TRes);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `BridgeClient request timed out after ${timeoutMs}ms: ${message.type}`,
          ),
        );
      }, timeoutMs);

      this.anyHandlers.add(handler);
      void this.handle(outgoing);
    });
  }

  /** Delivers a host->UI message to every registered listener -- the desktop-app analogue of `webview.postMessage`. */
  private emit(message: BridgeMessage): void {
    const set = this.handlers.get(message.type);
    if (set) {
      for (const handler of [...set]) handler(message);
    }
    for (const handler of [...this.anyHandlers]) handler(message);
  }

  private async handle(message: BridgeMessage): Promise<void> {
    switch (message.type) {
      case "pick-folder-request": {
        try {
          const selected = await pickWorkspaceFolder(message.defaultPath);
          this.emit({
            type: "pick-folder-result",
            requestId: message.requestId,
            folderPath: selected,
          });
        } catch (err) {
          console.warn("[WhoAmI] Failed to pick folder:", err);
          this.emit({
            type: "pick-folder-result",
            requestId: message.requestId,
            folderPath: null,
          });
        }
        return;
      }

      case "scan-workspace-request":
        await this.handleScanWorkspace(message.requestId, message.folderPath);
        return;

      case "get-trace-request": {
        const finding = this.lastScanFindings.get(message.findingId);
        if (!finding) {
          this.emit({
            type: "error",
            requestId: message.requestId,
            message: `No finding with id "${message.findingId}" in the current scan results.`,
          });
          return;
        }
        this.emit({
          type: "get-trace-result",
          requestId: message.requestId,
          trace: finding.trace,
        });
        return;
      }

      // The desktop app is deliberately a read-only, offline tool -- no
      // fs write permission and no shell/http permissions are granted in
      // src-tauri/capabilities/default.json. apply-fix and run-poc are
      // answered honestly as unavailable rather than silently no-opping.
      case "apply-fix-request":
        this.emit({
          type: "apply-fix-result",
          requestId: message.requestId,
          applied: false,
        });
        this.emit({
          type: "error",
          requestId: message.requestId,
          message:
            "Applying fixes is not available in the desktop app: it is a read-only tool with no " +
            "filesystem write permission (see src-tauri/capabilities/default.json).",
        });
        return;

      case "run-poc-request":
        this.emit({
          type: "run-poc-result",
          requestId: message.requestId,
          verified: false,
          detail:
            "PoC runtime verification is not available in the desktop app: it has no shell/http " +
            "permissions (offline, read-only tool).",
        });
        return;

      case "get-workspace-graph-request":
        this.emit({
          type: "get-workspace-graph-result",
          requestId: message.requestId,
          graph: this.lastWorkspaceGraph,
        });
        return;

      case "jump-to-line":
        // There is no editor pane in this app (unlike the VS Code
        // extension, which can drive vscode's own editor) -- fire-and-forget
        // per the protocol, nothing more to do host-side.
        console.info(
          `[WhoAmI] jump-to-line ${message.filePath}:${message.line} (no editor pane to jump in)`,
        );
        return;

      // scan-workspace-progress / scan-workspace-result / get-trace-result /
      // apply-fix-result / run-poc-result / error are host->UI-only in this
      // app's flow -- nothing to do if the UI itself sends one.
      default:
        return;
    }
  }

  private async handleScanWorkspace(
    requestId: string | undefined,
    folderPath?: string,
  ): Promise<void> {
    try {
      let picked: PickedWorkspace | null = null;
      if (folderPath && folderPath.trim()) {
        const trimmed = folderPath.trim();
        try {
          picked = await readWorkspaceFromPath(trimmed);
        } catch (err) {
          console.warn(`[WhoAmI] Could not scan directory "${trimmed}":`, err);
        }

        if (!picked || picked.files.length === 0) {
          this.emit({
            type: "error",
            requestId,
            message: `Directory "${trimmed}" contains no scannable files or could not be accessed.`,
          });
          return;
        }
      } else {
        picked = await pickAndReadWorkspace();
      }

      if (!picked) {
        this.emit({
          type: "error",
          requestId,
          message: "Workspace scan cancelled: no folder was selected or folder contains no scannable files.",
        });
        return;
      }

      const result = await scanFilesInWorker(picked.files, picked.rootPath, {
        onProgress: (scanned, total) => {
          this.emit({
            type: "scan-workspace-progress",
            requestId,
            scanned,
            total,
          });
        },
      });

      // SecretFinding results have no BridgeMessage of their own yet (see
      // packages/types/src/bridge.ts) -- scan-workspace-result only carries
      // `findings`. Rather than silently dropping them, they're logged here;
      // wiring a real secrets channel is a contract-first change that
      // belongs in packages/types first (see the webview-bridge skill's
      // "Adding a new message type" rule), not something to freelance from
      // this app alone.
      if (result.secrets.length > 0) {
        console.warn(
          `[WhoAmI] ${result.secrets.length} secret(s) detected but not yet surfaced in the UI ` +
            "(no BridgeMessage variant carries SecretFinding yet):",
          result.secrets,
        );
      }

      this.lastScanFindings = new Map(
        result.findings.map((finding) => [finding.id, finding]),
      );
      this.lastWorkspaceGraph = result.workspaceGraph;
      this.emit({
        type: "scan-workspace-result",
        requestId,
        findings: result.findings,
      });
    } catch (err) {
      this.emit({
        type: "error",
        requestId,
        message:
          err instanceof Error
            ? err.message
            : "Workspace scan failed for an unknown reason.",
      });
    }
  }
}
