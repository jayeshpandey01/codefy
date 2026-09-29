/**
 * GraphRAG: Context-Aware Vulnerability Intelligence & Hallucination Elimination
 *
 * Grounded in:
 * - USENIX Security 2025 (LLMxCPG)
 * - NeurIPS 2026 (SLICE)
 * - ACL 2024 (LLMSAN)
 * - Jurafsky & Martin / Rasa DIET (Hybrid Statistical NLU)
 */

export {
  analyzeQuery,
  tokenizeText,
  splitCamelCase,
  splitCompound,
  extractSlots,
  classifyIntent,
} from "./nlu-analyzer.js";
export type {
  QueryIntent,
  ExtractedSlots,
  NluAnalysis,
} from "./nlu-analyzer.js";

export {
  OkfBm25Index,
  buildOkfBm25Index,
} from "./okf-bm25-retriever.js";
export type {
  OkfChunkType,
  IndexedChunk,
  ScoredOkfChunk,
} from "./okf-bm25-retriever.js";

export { buildProgramSlice } from "./program-slicer.js";
export type { ProgramSlice } from "./program-slicer.js";

export {
  synthesizePrompt,
  BASE_SECURITY_SYSTEM_PROMPT,
} from "./prompt-synthesizer.js";
export type { SynthesizedPrompt } from "./prompt-synthesizer.js";

export { verifyLlmResponse } from "./hallucination-guard.js";
export type {
  VerificationResult,
  VerificationViolation,
  GuardContext,
  ViolationType,
} from "./hallucination-guard.js";

export { executeRagRetrieval } from "./orchestrator.js";
export type {
  RagPipelineOptions,
  RagRetrievalResult,
} from "./orchestrator.js";
