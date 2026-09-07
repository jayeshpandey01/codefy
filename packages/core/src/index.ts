export { createAstGrepAdapter } from "./ast-grep/index.js";
export type { AstGrepMatch, IAstGrepAdapter } from "./ast-grep/index.js";

export { createAnalysisEngine } from "./engine.js";
export type {
  AnalysisEngine,
  CreateAnalysisEngineOptions,
  ScanResult,
} from "./engine.js";

export { DeterministicOnlyProvider } from "./llm/deterministic-only.provider.js";
export { OpenRouterTriageProvider } from "./llm/openrouter.provider.js";
export type { OpenRouterTriageProviderOptions } from "./llm/openrouter.provider.js";
export type { ILlmTriageProvider } from "./llm/provider.js";

export { getParser } from "./parser/registry.js";
export { evictFromCache, parseWithCache } from "./parser/parser-cache.js";
export {
  configureGrammarBaseUrl,
  ensureTreeSitterInitialized,
  loadLanguage,
} from "./parser/wasm-loader.js";
export type { SupportedLanguageId } from "./parser/wasm-loader.js";

export { ALL_RULES } from "./rules/registry.js";

export { calculateShannonEntropy } from "./secrets/entropy.js";
export { SECRET_REGEX_PATTERNS } from "./secrets/patterns.js";
export { scanForSecrets } from "./secrets/detector.js";

export { buildCandidatePaths } from "./taint/propagate.js";
export { resolveSanitizerStatus } from "./taint/sanitizer-filter.js";
export {
  matchKnownSanitizerPattern,
  SANITIZER_PATTERNS,
} from "./taint/sanitizers.js";
export { findSourceMatch, JS_TS_SOURCE_PATTERNS } from "./taint/sources.js";
export { getSinkRuleBinding, JS_TS_SINK_RULES } from "./taint/sinks.js";
export type { SinkRuleBinding } from "./taint/sinks.js";

export { buildWorkspaceGraph } from "./graph/workspace-graph.js";

export {
  Logger,
  ConsoleTransport,
  MemoryTransport,
  AxiomTransport,
  detectPlatform,
  redactSensitiveData,
  sanitizeString,
  APP_VERSION,
} from "./logging/index.js";
export type { ConsoleTransportOptions } from "./logging/index.js";

export {
  ScanOrchestratorClient,
  OrchestratorApiError,
  DEFAULT_ORCHESTRATOR_URL,
  sanitizeTargetHostname,
  normalizeRemoteFindings,
} from "./orchestrator/index.js";
export type { PollScanOptions } from "./orchestrator/index.js";

export { parseQuery } from "./query/intent.js";
export { executeQuery, runChatQuery } from "./query/executor.js";
export type { ExecuteQueryOptions } from "./query/executor.js";
export { pickGraphViewMode } from "./query/graph-view-picker.js";
export { HostedLlmClient } from "./llm/hosted-client.js";
export type { HostedLlmClientOptions } from "./llm/hosted-client.js";
