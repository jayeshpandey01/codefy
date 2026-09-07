import type { Finding, SecretFinding, WorkspaceGraph } from "@whoami/types";

/**
 * The postMessage protocol between the main thread (src/bridge/engineWorker.ts)
 * and the analysis Worker (src/worker/engine.worker.ts). Deliberately a
 * separate, tiny, dependency-free file that both sides import type-only:
 * neither side needs to pull in the other's implementation module just to
 * see these shapes, and in particular the main thread must never statically
 * import engine.worker.ts itself (that would drag @whoami/core/wasm into the
 * main bundle -- see engineWorker.ts's module doc).
 */

export interface EngineWorkerFileInput {
  readonly path: string;
  readonly content: string;
}

export interface EngineWorkerScanRequest {
  readonly kind: "scan-request";
  readonly requestId: string;
  readonly files: readonly EngineWorkerFileInput[];
  /** The picked workspace folder's absolute path — needed by
   * buildWorkspaceGraph() to compute directory nodes relative to it. */
  readonly rootPath: string;
}

export type EngineWorkerInboundMessage = EngineWorkerScanRequest;

export interface EngineWorkerScanProgress {
  readonly kind: "scan-progress";
  readonly requestId: string;
  readonly scanned: number;
  readonly total: number;
}

export interface EngineWorkerScanResult {
  readonly kind: "scan-result";
  readonly requestId: string;
  readonly findings: readonly Finding[];
  readonly secrets: readonly SecretFinding[];
  readonly workspaceGraph: WorkspaceGraph;
}

export interface EngineWorkerScanError {
  readonly kind: "scan-error";
  readonly requestId: string;
  readonly message: string;
}

export type EngineWorkerOutboundMessage =
  EngineWorkerScanProgress | EngineWorkerScanResult | EngineWorkerScanError;
