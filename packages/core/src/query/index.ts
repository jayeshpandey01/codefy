/**
 * Standalone entry point for the chat query engine — see
 * docs/CHAT-QUERY-ENGINE-SPEC.md §B.4. Deliberately built and exported
 * separately from the main `@whoami/core` entry (src/index.ts): this
 * subtree has zero dependency on ast-grep/web-tree-sitter (it only touches
 * plain Finding[]/WorkspaceGraph values and packages/core/src/rules/registry.ts's
 * string constants), so it's safe to import directly from a browser-context
 * UI thread — the VS Code webview, or the Tauri desktop app's main thread —
 * without dragging in the native-addon (napi) or WASM (ast-grep/tree-sitter)
 * payload those contexts must never load directly (see this app's own
 * engine.worker.ts module doc on why that payload is Worker-only).
 */
export { parseQuery } from "./intent.js";
export { executeQuery, runChatQuery } from "./executor.js";
export type { ExecuteQueryOptions } from "./executor.js";
export { pickGraphViewMode } from "./graph-view-picker.js";
