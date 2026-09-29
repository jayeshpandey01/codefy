/**
 * Analysis engine entry point, running inside a dedicated Worker.
 *
 * `@whoami/core/wasm` (and therefore @ast-grep/wasm + web-tree-sitter) is
 * imported ONLY here, never from main.tsx or anything reachable from the
 * main thread -- see the Worker-only architecture note in this app's
 * TauriBridgeClient.ts and engineWorker.ts. This module never touches
 * Tauri's IPC bridge (no `@tauri-apps/*` import anywhere in this file): it
 * only ever receives an in-memory file map via postMessage from the main
 * thread and posts Finding/SecretFinding results back the same way.
 *
 * The desktop Worker intentionally has two Tree-sitter runtimes: the legacy
 * 0.24 runtime and grammar set used by core's cross-language syntax checker,
 * and the 0.26 runtime plus rebuilt-format JS/TS grammars required by
 * @ast-grep/wasm. vite.config.ts keeps their grammar assets separate.
 */
import type { AnalysisEngine } from "@whoami/core/wasm";
import type { Finding, SecretFinding, WorkspaceGraph } from "@whoami/types";
import type {
  EngineWorkerFileInput,
  EngineWorkerInboundMessage,
  EngineWorkerOutboundMessage,
} from "../engineWorkerProtocol.js";
import {
  resolveAstGrepGrammarBaseUrl,
  resolveGrammarBaseUrl,
} from "./grammarAssets.js";

function postOutbound(message: EngineWorkerOutboundMessage): void {
  postMessage(message);
}

function diagnostic(requestId: string, level: "info" | "warn" | "error", message: string): void {
  postOutbound({ kind: "scan-diagnostic", requestId, level, message });
}

self.onmessage = (event: MessageEvent<EngineWorkerInboundMessage>): void => {
  const message = event.data;
  if (message.kind !== "scan-request") return;

  void runScan(message.requestId, message.files, message.rootPath);
};

interface EngineRuntime {
  readonly engine: AnalysisEngine;
  readonly buildWorkspaceGraph: (
    paths: readonly string[],
    findings: readonly Finding[],
    fileContents: Map<string, string>,
    rootPath: string,
  ) => WorkspaceGraph;
}

let enginePromise: Promise<EngineRuntime> | undefined;

async function loadEngine(requestId: string): Promise<EngineRuntime> {
  if (!enginePromise) {
    enginePromise = (async () => {
      // Keep the Worker message handler lightweight. A static import here
      // evaluates the full WASM dependency graph before onmessage is installed,
      // so a stalled WASM module load looks exactly like a Worker that never
      // received the request.
      diagnostic(requestId, "info", "Loading core analysis and WASM modules.");
      const core = await import("@whoami/core/wasm");
      diagnostic(requestId, "info", "Core analysis modules loaded; configuring grammar assets.");
      core.configureGrammarBaseUrl(resolveGrammarBaseUrl());
      core.configureAstGrepGrammarBaseUrl(resolveAstGrepGrammarBaseUrl());
      // Explicit provider avoids process.env access in the browser Worker and
      // keeps the offline desktop scanner deterministic.
      const engine = core.createAnalysisEngine({
        llmProvider: new core.DeterministicOnlyProvider(),
      });
      return { engine, buildWorkspaceGraph: core.buildWorkspaceGraph };
    })();
  }

  return enginePromise;
}

async function runScan(
  requestId: string,
  files: readonly EngineWorkerFileInput[],
  rootPath: string,
): Promise<void> {
  try {
    const startedAt = Date.now();
    diagnostic(requestId, "info", `Worker received ${files.length} file(s) for scan.`);
    const runtime = await loadEngine(requestId);
    diagnostic(requestId, "info", "Analysis runtime ready; beginning file scans (first file includes parser initialization).");
    const findings: Finding[] = [];
    const secrets: SecretFinding[] = [];
    const filesWithoutRecognizedLanguage = new Set<string>();
    const total = files.length;
    let scanned = 0;
    let failedFiles = 0;
    let lastProgressLogAt = startedAt;

    const CONCURRENCY = 6;
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < files.length) {
        const idx = currentIndex++;
        const file = files[idx];
        if (!file) break;

        try {
          const fileStartedAt = Date.now();
          if (idx === 0) {
            diagnostic(requestId, "info", `Initializing parsers and scanning first file (${file.path}).`);
          }
          const result = await runtime.engine.scanFile(file.path, file.content);
          findings.push(...result.findings);
          secrets.push(...result.secrets);
          if (result.findings.length === 0 && result.secrets.length === 0) {
            // Keep a small representative sample for the final diagnostic.
            // A zero-result completion is otherwise indistinguishable from a
            // healthy scan when traversal selected unsupported extensions.
            if (filesWithoutRecognizedLanguage.size < 5 && !hasLikelySourceExtension(file.path)) {
              filesWithoutRecognizedLanguage.add(file.path);
            }
          }
          if (Date.now() - fileStartedAt >= 5_000) {
            diagnostic(requestId, "warn", `Slow file scan (${file.path}): ${Math.round((Date.now() - fileStartedAt) / 1000)}s.`);
          }
        } catch (err) {
          failedFiles += 1;
          diagnostic(requestId, "error", `Unable to analyze ${file.path}; continuing with remaining files: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          scanned += 1;
          postOutbound({ kind: "scan-progress", requestId, scanned, total });
          const now = Date.now();
          if (scanned === total || scanned % 25 === 0 || now - lastProgressLogAt >= 10_000) {
            diagnostic(requestId, "info", `Worker progress ${scanned}/${total}; findings=${findings.length}, secrets=${secrets.length}, elapsed=${Math.round((now - startedAt) / 1000)}s.`);
            lastProgressLogAt = now;
          }
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, files.length) },
      () => worker(),
    );
    await Promise.all(workers);
    if (failedFiles > 0) {
      diagnostic(requestId, "warn", `Partial scan: ${failedFiles}/${total} file(s) failed analysis; results cover the remaining files.`);
      if (failedFiles === total) {
        throw new Error(`Analysis failed for all ${total} scanned files.`);
      }
    }
    diagnostic(requestId, "info", `Worker finished file scan in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
    if (findings.length === 0 && filesWithoutRecognizedLanguage.size > 0) {
      diagnostic(requestId, "warn", `No findings returned. Some scanned files have no local parser or security rules; sample paths: ${[...filesWithoutRecognizedLanguage].join(", ")}.`);
    }

    // Chat query engine's LIST_FILES_WITH_FINDINGS intent (see
    // docs/CHAT-QUERY-ENGINE-SPEC.md §B.6) needs this WorkspaceGraph, same as
    // the "Unified Architecture"/"Blast Radius"/"Supply Chain" graph views —
    // built once here, alongside the scan that already has every file's
    // content in memory, rather than re-reading files for a separate request.
    diagnostic(requestId, "info", "Building workspace graph from scan results.");
    const fileContents = new Map(files.map((f) => [f.path, f.content]));
    const workspaceGraph = runtime.buildWorkspaceGraph(
      files.map((f) => f.path),
      findings,
      fileContents,
      rootPath,
    );
    diagnostic(requestId, "info", "Workspace graph built; returning scan results.");

    postOutbound({ kind: "scan-result", requestId, findings, secrets, workspaceGraph });
  } catch (err) {
    diagnostic(requestId, "error", `Worker scan aborted: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    postOutbound({
      kind: "scan-error",
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

function hasLikelySourceExtension(filePath: string): boolean {
  return /\.(?:[cm]?[jt]sx?|pyw?|json|html?|css|go|rs|java|c|h|cc|cpp|cxx|hpp|cs|php|rb|ya?ml|toml|bash?|kt|kts|swift|vue|dart|lua|sol)$/i.test(filePath);
}
