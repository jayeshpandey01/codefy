import type { Finding, RuleToggleConfig, SecretFinding, WorkspaceGraph } from "@whoami/types";
import type { WorkspaceFile } from "./workspaceFs.js";
import type {
  EngineWorkerInboundMessage,
  EngineWorkerOutboundMessage,
} from "../engineWorkerProtocol.js";

export interface EngineScanResult {
  readonly findings: readonly Finding[];
  readonly secrets: readonly SecretFinding[];
  readonly workspaceGraph: WorkspaceGraph;
  readonly filesFailed: number;
}

export interface EngineScanHandlers {
  readonly onProgress?: (scanned: number, total: number) => void;
  readonly onDiagnostic?: (level: "info" | "warn" | "error", message: string) => void;
  readonly rules?: RuleToggleConfig;
}

let workerInstance: Worker | undefined;
let requestCounter = 0;

/**
 * Lazily creates the single shared engine Worker. `@whoami/core/wasm` (and
 * therefore the whole wasm ast-grep/tree-sitter payload) is only ever
 * imported from src/worker/engine.worker.ts -- this file, and everything
 * that imports it (TauriBridgeClient.ts, main.tsx), only ever sees message
 * types, never the engine itself, so the wasm payload never enters the
 * initial UI bundle.
 */
function getWorker(): Worker {
  workerInstance ??= new Worker(
    new URL("../worker/engine.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  return workerInstance;
}

/**
 * Typed request/response wrapper around the engine Worker, correlated by
 * requestId -- mirrors the same correlation pattern packages/ui's
 * BridgeClient uses for the postMessage-based bridge (see the webview-bridge
 * skill), just one layer further in (main thread <-> Worker, rather than
 * host <-> webview).
 */
export function scanFilesInWorker(
  files: readonly WorkspaceFile[],
  rootPath: string,
  handlers: EngineScanHandlers = {},
): Promise<EngineScanResult> {
  const worker = getWorker();
  requestCounter += 1;
  const requestId = `engine-scan-${requestCounter}-${Date.now()}`;

  return new Promise<EngineScanResult>((resolve, reject) => {
    const startedAt = Date.now();
    let lastProgressAt = startedAt;
    let scannedCount = 0;
    let totalCount = files.length;
    handlers.onDiagnostic?.("info", `Starting analysis Worker request ${requestId} with ${files.length} file(s).`);
    const watchdog = window.setInterval(() => {
      const now = Date.now();
      const quietSeconds = Math.round((now - lastProgressAt) / 1000);
      handlers.onDiagnostic?.("warn", `Still waiting for Worker request ${requestId}: progress ${scannedCount}/${totalCount}, no completed file for ${quietSeconds}s, elapsed ${Math.round((now - startedAt) / 1000)}s.`);
    }, 15_000);

    const cleanup = (): void => {
      window.clearInterval(watchdog);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
    };

    const onMessage = (
      event: MessageEvent<EngineWorkerOutboundMessage>,
    ): void => {
      const message = event.data;
      if (message.requestId !== requestId) return;

      if (message.kind === "scan-progress") {
        scannedCount = message.scanned;
        totalCount = message.total;
        lastProgressAt = Date.now();
        handlers.onProgress?.(message.scanned, message.total);
        return;
      }

      if (message.kind === "scan-diagnostic") {
        handlers.onDiagnostic?.(message.level, message.message);
        return;
      }

      cleanup();
      handlers.onDiagnostic?.("info", `Worker request ${requestId} completed in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
      if (message.kind === "scan-result") {
        resolve({
          findings: message.findings,
          secrets: message.secrets,
          workspaceGraph: message.workspaceGraph,
          filesFailed: message.filesFailed,
        });
      } else {
        reject(new Error(message.message));
      }
    };

    const onError = (event: ErrorEvent): void => {
      cleanup();
      handlers.onDiagnostic?.("error", `Worker crashed for request ${requestId}: ${event.message || "unknown Worker error"}`);
      reject(
        new Error(
          event.message || "The analysis engine Worker crashed unexpectedly.",
        ),
      );
    };

    const onMessageError = (): void => {
      cleanup();
      handlers.onDiagnostic?.("error", `Worker sent an unreadable message for request ${requestId}.`);
      reject(new Error("The analysis engine Worker sent an unreadable response."));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);

    const request: EngineWorkerInboundMessage = {
      kind: "scan-request",
      requestId,
      files,
      rootPath,
      rules: handlers.rules,
    };
    worker.postMessage(request);
  });
}
