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
export { executeQuery, runChatQuery, buildDynamicSuggestions, buildSuggestions } from "./executor.js";
export type { ExecuteQueryOptions, DynamicSuggestionContext } from "./executor.js";
export { pickGraphViewMode } from "./graph-view-picker.js";
export {
  parseSlashCommand,
  executeSlashCommand,
  executeUnknownSlashCommand,
  SLASH_COMMANDS,
} from "./slash-commands.js";
export type { ParsedSlashCommand, UnknownSlashCommand, SlashCommandSpec } from "./slash-commands.js";
export { HostedLlmClient, DEFAULT_AI_GATEWAY_URL } from "../llm/hosted-client.js";
export type {
  HostedLlmClientOptions,
  StreamRagChatOptions,
  AiChatQueryRequest,
  AiChatQueryResponse,
} from "../llm/hosted-client.js";
export { GatewayAuthClient } from "../auth/gateway-auth-client.js";
export type {
  GatewayAuthClientOptions,
  RegisterInput,
  RegisterResult,
} from "../auth/gateway-auth-client.js";
export { generateOkfBundle } from "../okf/generator.js";
export { generateMarkdownReport } from "../report/generator.js";
export { generateFixDiffText, generateUnifiedDiff } from "../report/diff-suggestion.js";
export type { FixDiffText } from "../report/diff-suggestion.js";
export { executeRagRetrieval } from "../rag/index.js";
export type { RagPipelineOptions, RagRetrievalResult } from "../rag/index.js";
export {
  DEFAULT_ORCHESTRATOR_URL,
  DEFAULT_AUTH_SERVICE_URL,
  DEFAULT_SAST_SERVICE_URL,
  DEFAULT_DAST_SERVICE_URL,
  FALLBACK_DAST_SERVICE_URL,
  DEFAULT_OPERATOR_API_KEY,
  DEFAULT_ADMIN_API_KEY,
} from "../orchestrator/constants.js";
export { UnifiedSecurityClient } from "../orchestrator/unified-security-client.js";
export type { UnifiedSecurityClientOptions } from "../orchestrator/unified-security-client.js";
export { SastClient } from "../sast/client.js";
export type { SastClientOptions, PollJobOptions } from "../sast/client.js";
export { DastClient } from "../dast/client.js";
export type { DastClientOptions, PollDastJobOptions } from "../dast/client.js";
export {
  normalizeSastJobFindings,
  normalizeDastJobFindings,
  convertScanResultToFindings,
  normalizeRemoteFindings,
} from "../orchestrator/normalizer.js";
// Browser-safe (plain fetch, no ast-grep/tree-sitter): lets the Tauri main
// thread drive the orchestrator with the http plugin's fetch as fetchFn.
export {
  ScanOrchestratorClient,
  OrchestratorApiError,
  cleanCredential,
} from "../orchestrator/client.js";
export type { PollScanOptions } from "../orchestrator/client.js";
export {
  handleOrchestratorMessage,
  isOrchestratorRequest,
} from "../orchestrator/bridge-router.js";
export {
  ORCHESTRATOR_ORIGIN_ALLOWLIST,
  validateOrchestratorUrl,
  resolveOrchestratorUrl,
} from "../orchestrator/url-config.js";
export type { OrchestratorUrlValidation } from "../orchestrator/url-config.js";
