import type { Finding, SecretFinding, WorkspaceGraph } from "@whoami/types";
import type { WorkspaceFile } from "./workspaceFs.js";
import type {
  EngineWorkerInboundMessage,
  EngineWorkerOutboundMessage,
} from "../engineWorkerProtocol.js";

export interface EngineScanResult {
  readonly findings: readonly Finding[];
  readonly secrets: readonly SecretFinding[];
  readonly workspaceGraph: WorkspaceGraph;
}

export interface EngineScanHandlers {
  readonly onProgress?: (scanned: number, total: number) => void;
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
    const cleanup = (): void => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };

    const onMessage = (
      event: MessageEvent<EngineWorkerOutboundMessage>,
    ): void => {
      const message = event.data;
      if (message.requestId !== requestId) return;

      if (message.kind === "scan-progress") {
        handlers.onProgress?.(message.scanned, message.total);
        return;
      }

      cleanup();
      if (message.kind === "scan-result") {
        resolve({
          findings: message.findings,
          secrets: message.secrets,
          workspaceGraph: message.workspaceGraph,
        });
      } else {
        reject(new Error(message.message));
      }
    };

    const onError = (event: ErrorEvent): void => {
      cleanup();
      reject(
        new Error(
          event.message || "The analysis engine Worker crashed unexpectedly.",
        ),
      );
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    const request: EngineWorkerInboundMessage = {
      kind: "scan-request",
      requestId,
      files,
      rootPath,
    };
    worker.postMessage(request);
  });
}
