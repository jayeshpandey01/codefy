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
 * KNOWN BUILD/RUNTIME RISK -- see this app's top-level build notes for full
 * detail and reproduction: `@ast-grep/wasm@0.45.3` statically imports named
 * exports `{ Parser, Language }` from `web-tree-sitter`, which only exist
 * starting in `web-tree-sitter@0.26.0` (it changed from a default export to
 * named exports between 0.24.x and 0.26.x). packages/core currently pins
 * `web-tree-sitter@^0.24.6` (to match `tree-sitter-wasms`' expectations and
 * its own default-export-based usage in parser/registry.ts). With that
 * pinned version, importing `@whoami/core/wasm` transitively imports
 * `@ast-grep/wasm`, whose module graph fails to even load with a hard
 * `SyntaxError` at import time -- reproduced directly against the installed
 * packages, not merely inferred from version ranges. This is a real,
 * unresolved blocker in packages/core, not something this file can work
 * around from the consuming side.
 */
import {
  buildWorkspaceGraph,
  configureGrammarBaseUrl,
  createAnalysisEngine,
  DeterministicOnlyProvider,
} from "@whoami/core/wasm";
import type { Finding, SecretFinding } from "@whoami/types";
import type {
  EngineWorkerFileInput,
  EngineWorkerInboundMessage,
  EngineWorkerOutboundMessage,
} from "../engineWorkerProtocol.js";
import { resolveGrammarBaseUrl } from "./grammarAssets.js";

configureGrammarBaseUrl(resolveGrammarBaseUrl());

// Explicitly pass a provider rather than letting createAnalysisEngine() fall
// back to its own default resolution: packages/core's
// resolveDefaultLlmProvider() reads `process.env['OPENROUTER_API_KEY']`,
// and `process` does not exist in a Worker/browser global scope -- that
// reference throws a ReferenceError there, before a single file gets
// scanned. DeterministicOnlyProvider is also the correct default for this
// offline, read-only desktop build regardless (see CLAUDE.md's "LLM triage
// is opt-in, not load-bearing"); a future OPENROUTER_API_KEY-driven opt-in
// for the desktop app would need its own explicit UI/config, not a bare
// process.env read.
const engine = createAnalysisEngine({
  llmProvider: new DeterministicOnlyProvider(),
});

function postOutbound(message: EngineWorkerOutboundMessage): void {
  postMessage(message);
}

self.onmessage = (event: MessageEvent<EngineWorkerInboundMessage>): void => {
  const message = event.data;
  if (message.kind !== "scan-request") return;

  void runScan(message.requestId, message.files, message.rootPath);
};

async function runScan(
  requestId: string,
  files: readonly EngineWorkerFileInput[],
  rootPath: string,
): Promise<void> {
  try {
    const findings: Finding[] = [];
    const secrets: SecretFinding[] = [];
    const total = files.length;
    let scanned = 0;

    for (const file of files) {
      const result = await engine.scanFile(file.path, file.content);
      findings.push(...result.findings);
      secrets.push(...result.secrets);
      scanned += 1;
      postOutbound({ kind: "scan-progress", requestId, scanned, total });
    }

    // Chat query engine's LIST_FILES_WITH_FINDINGS intent (see
    // docs/CHAT-QUERY-ENGINE-SPEC.md §B.6) needs this WorkspaceGraph, same as
    // the "Unified Architecture"/"Blast Radius"/"Supply Chain" graph views —
    // built once here, alongside the scan that already has every file's
    // content in memory, rather than re-reading files for a separate request.
    const fileContents = new Map(files.map((f) => [f.path, f.content]));
    const workspaceGraph = buildWorkspaceGraph(
      files.map((f) => f.path),
      findings,
      fileContents,
      rootPath,
    );

    postOutbound({ kind: "scan-result", requestId, findings, secrets, workspaceGraph });
  } catch (err) {
    postOutbound({
      kind: "scan-error",
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
