import type { BridgeClient, BridgeMessageOfType } from "@whoami/ui";
import {
  type BridgeMessage,
  type BridgeMessageType,
  type Finding,
  type RuleToggleConfig,
  type WorkspaceGraph,
  VercelError,
  toStructuredError,
} from "@whoami/types";
import {
  DEFAULT_ORCHESTRATOR_URL,
  DEFAULT_OPERATOR_API_KEY,
  DEFAULT_ADMIN_API_KEY,
  DEFAULT_SAST_SERVICE_URL,
  DEFAULT_DAST_SERVICE_URL,
  DEFAULT_AUTH_SERVICE_URL,
  ScanOrchestratorClient,
  handleOrchestratorMessage,
} from "@whoami/core/query";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getAuthSession } from "../db/authRepo.js";
import { getSettings } from "../db/preferencesRepo.js";
import { pickAndReadWorkspace, pickWorkspaceFolder, readWorkspaceFromPath, type PickedWorkspace } from "./workspaceFs.js";
import { scanFilesInWorker } from "./engineWorker.js";
import { invoke } from "@tauri-apps/api/core";
import { checkForAppUpdate, installPendingUpdate, restartApp, checkForVersionChange } from "./updater.js";

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

  private static readonly UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

  constructor() {
    // Update checks are the one outbound network call this app makes on its
    // own -- orchestrator calls happen only when the user starts a cloud
    // scan (see src-tauri/capabilities/default.json's updated
    // description and docs/RELEASE-PIPELINE.md) -- they run through the
    // Tauri updater plugin's Rust side, never through this webview's fetch,
    // so the CSP connect-src needs no change for this. A failed check (e.g.
    // genuinely offline) is swallowed inside checkForAppUpdate/
    // checkForVersionChange rather than surfaced as an error notice -- an
    // offline launch should be silent, not alarming.
    void this.runStartupUpdateChecks();
    setInterval(() => {
      void checkForAppUpdate((notice) => this.emit({ type: "update-notice", notice }));
    }, TauriBridgeClient.UPDATE_CHECK_INTERVAL_MS);
  }

  private async runStartupUpdateChecks(): Promise<void> {
    const updatedNotice = await checkForVersionChange();
    if (updatedNotice) {
      this.emit({ type: "update-notice", notice: updatedNotice });
    }
    await checkForAppUpdate((notice) => this.emit({ type: "update-notice", notice }));
  }

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
        if (incoming.type === "error") {
          reject(new Error(incoming.message));
        } else {
          resolve(incoming as TRes);
        }
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

  /**
   * Built fresh per orchestrator request (as VS Code's extensionBridge does),
   * so a URL or key changed in Settings applies on the next call with no
   * invalidation plumbing. Requests go through the http plugin's fetch, i.e.
   * from Rust: the orchestrator sends no CORS headers, so the webview's own
   * fetch would be blocked. Allowed hosts: capabilities/default.json.
   */
  private async createOrchestratorClient(): Promise<ScanOrchestratorClient> {
    const session = await getAuthSession();
    const jwtToken =
      session?.accessToken && session.accessToken !== "offline-local-session"
        ? session.accessToken
        : undefined;

    return new ScanOrchestratorClient({
      baseUrl: DEFAULT_ORCHESTRATOR_URL,
      sastBaseUrl: DEFAULT_SAST_SERVICE_URL,
      dastBaseUrl: DEFAULT_DAST_SERVICE_URL,
      authBaseUrl: DEFAULT_AUTH_SERVICE_URL,
      apiKey: DEFAULT_OPERATOR_API_KEY,
      adminApiKey: DEFAULT_ADMIN_API_KEY,
      authMode: "api_key",
      jwtToken,
      useMicroservices: true,
      fetchFn: tauriFetch as typeof fetch,
    });
  }

  private emitError(requestId: string | undefined, err: unknown, fallbackScope: string): void {
    this.emit({ type: "error", requestId, ...toStructuredError(err, fallbackScope) });
  }

  private async handle(message: BridgeMessage): Promise<void> {
    // Cloud orchestrator requests: shared with the VS Code extension host
    // (packages/core/src/orchestrator/bridge-router.ts).
    try {
      if (
        await handleOrchestratorMessage(
          () => this.createOrchestratorClient(),
          message,
          (reply) => this.emit(reply),
        )
      ) {
        return;
      }
    } catch (err) {
      this.emitError(message.requestId, err, "orchestrator");
      return;
    }

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
        await this.handleScanWorkspace(message.requestId, message.folderPath, message.rules);
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

      // No fs write or shell permission is granted in
      // src-tauri/capabilities/default.json (the http plugin is scoped to
      // the orchestrator only), and there is no local probe runner.
      // apply-fix and run-poc are answered honestly as unavailable rather
      // than silently no-opping -- or, worse, reporting a probe as verified
      // without running one.
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
            "PoC runtime verification is not available in the desktop app: it has no local " +
            "probe runner.",
        });
        return;

      case "get-workspace-graph-request":
        this.emit({
          type: "get-workspace-graph-result",
          requestId: message.requestId,
          graph: this.lastWorkspaceGraph,
        });
        return;

      case "update-install-request":
        await installPendingUpdate((notice) => this.emit({ type: "update-notice", notice }));
        return;

      case "update-restart-request":
        await restartApp();
        return;

      case "update-dismiss-request":
        // Purely a UI-side dismissal (UpdateBanner hides itself); nothing
        // persists host-side about a dismissed "available"/"ready" notice --
        // the next check() call (interval or next launch) will re-announce
        // it if it's still the latest version, same as VS Code re-showing an
        // extension update if you never install it.
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
      //
      // Everything else that reaches here is a *-request this class has no
      // case for. Orchestrator requests never get here (dispatched above);
      // in practice this is the auth-* family, which App.tsx sends straight
      // to the AI gateway itself, and persistence-*, which this app keeps in
      // IndexedDB. Answer immediately rather than let request() hang until
      // its timeout with no explanation.
      default:
        if (message.type.endsWith("-request")) {
          this.emit({
            type: "error",
            requestId: message.requestId,
            message: `"${message.type}" is not handled by the desktop app's bridge.`,
          });
        }
        return;
    }
  }

  private async handleScanWorkspace(
    requestId: string | undefined,
    folderPath?: string,
    rules?: RuleToggleConfig,
  ): Promise<void> {
    const scanStartedAt = Date.now();
    const scanLog = (level: "info" | "warn" | "error", message: string): void => {
      const requestLabel = requestId ?? "no-request-id";
      void invoke("log_scan_diagnostic", {
        level,
        message: `[request=${requestLabel}] ${message}`,
      }).catch((err: unknown) => {
        console.warn("[WhoAmI] Could not forward scan diagnostics to terminal:", err);
      });
    };
    try {
      scanLog("info", `Scan requested${folderPath ? ` for ${folderPath}` : " (folder picker)"}.`);
      let picked: PickedWorkspace | null = null;
      if (folderPath && folderPath.trim()) {
        const trimmed = folderPath.trim();
        try {
          picked = await readWorkspaceFromPath(trimmed);
        } catch (err) {
          console.warn(`[WhoAmI] Could not scan directory "${trimmed}":`, err);
        }

        if (!picked || picked.files.length === 0) {
          scanLog("error", `No scannable files loaded from ${trimmed}.`);
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
        scanLog("warn", "Scan cancelled or folder selection returned no workspace.");
        this.emit({
          type: "error",
          requestId,
          message: "Workspace scan cancelled: no folder was selected or folder contains no scannable files.",
        });
        return;
      }

      if (picked.files.length === 0) {
        scanLog("error", `No scannable files loaded from ${picked.rootPath}.`);
        this.emit({
          type: "error",
          requestId,
          message: `Folder "${picked.rootPath}" contains no supported readable source files.`,
        });
        return;
      }

      scanLog("info", `Workspace loaded: ${picked.files.length} file(s) from ${picked.rootPath}; starting analysis Worker.`);

      const settings = await getSettings();
      const result = await scanFilesInWorker(picked.files, picked.rootPath, {
        rules: rules ?? settings.rules,
        onDiagnostic: scanLog,
        onProgress: (scanned, total) => {
          this.emit({
            type: "scan-workspace-progress",
            requestId,
            scanned,
            total,
          });
        },
      });
      scanLog("info", `Scan complete in ${Math.round((Date.now() - scanStartedAt) / 1000)}s: findings=${result.findings.length}, secrets=${result.secrets.length}.`);
      if (result.secrets.length > 0) {
        scanLog("warn", `${result.secrets.length} potential secret(s) detected; values omitted from diagnostics.`);
      }

      this.lastScanFindings = new Map(
        result.findings.map((finding) => [finding.id, finding]),
      );
      this.lastWorkspaceGraph = result.workspaceGraph;
      this.emit({
        type: "scan-workspace-result",
        requestId,
        findings: result.findings,
        coverage: {
          ...picked.coverage,
          filesScanned: picked.files.length - result.filesFailed,
          filesFailed: picked.coverage.filesFailed + result.filesFailed,
        },
      });
    } catch (err) {
      scanLog("error", `Scan failed after ${Math.round((Date.now() - scanStartedAt) / 1000)}s: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
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
