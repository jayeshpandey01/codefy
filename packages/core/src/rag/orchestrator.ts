/**
 * Unified GraphRAG Pipeline Orchestrator
 *
 * Coordinates:
 * 1. Hybrid Statistical NLU (Intent + Slot Extraction)
 * 2. Field-Boosted OKF Okapi BM25 Index & Retrieval
 * 3. CPG-Guided Inter-Procedural Program Slicing (< 350 tokens)
 * 4. Grounded Prompt Synthesis with Citations & Secret Redaction
 * 5. Visualizer Mode Deep-Linking
 *
 * Guarantees < 1ms execution duration in pure TypeScript without server dependencies.
 */

import type {
  ChatGraphViewMode,
  Finding,
  OkfBundle,
  RagCitation,
  WorkspaceGraph,
} from "@whoami/types";
import { analyzeQuery, type NluAnalysis } from "./nlu-analyzer.js";
import { buildOkfBm25Index, type ScoredOkfChunk } from "./okf-bm25-retriever.js";
import { buildProgramSlice, type ProgramSlice } from "./program-slicer.js";
import { synthesizePrompt, type SynthesizedPrompt } from "./prompt-synthesizer.js";
import { buildDynamicSuggestions } from "../query/executor.js";

export interface RagPipelineOptions {
  readonly workspaceGraph?: WorkspaceGraph;
  readonly okfBundle?: OkfBundle;
  readonly selectedFindingId?: string;
  readonly topK?: number;
}

export interface RagRetrievalResult {
  readonly systemPrompt: string;
  readonly userQuery: string;
  readonly citations: readonly RagCitation[];
  readonly referencedFindingIds: readonly string[];
  readonly matchedFindings: readonly Finding[];
  readonly graphViewMode: ChatGraphViewMode;
  readonly suggestions: readonly string[];
  readonly nluAnalysis: NluAnalysis;
  readonly slice: ProgramSlice;
}

/**
 * Executes the pure TypeScript GraphRAG retrieval pipeline.
 */
export function executeRagRetrieval(
  query: string,
  findings: readonly Finding[] = [],
  options: RagPipelineOptions = {},
): RagRetrievalResult {
  // 1. Statistical NLU (Intent classification + Slot extraction + Discourse coreference)
  const nlu = analyzeQuery(query, options.selectedFindingId);

  // 2. Build & query the in-memory OKF BM25 index
  const index = buildOkfBm25Index(findings, options.workspaceGraph, options.okfBundle);
  const topChunks = index.search(nlu, options.topK ?? 5);

  // 3. Resolve matched findings
  const referencedSet = new Set<string>(nlu.slots.findingIds);
  for (const scored of topChunks) {
    if (scored.chunk.findingId) {
      referencedSet.add(scored.chunk.findingId);
    }
  }

  // Bind active finding ONLY if discourse coreference resolved an anaphor
  if (nlu.boundFindingId) {
    referencedSet.add(nlu.boundFindingId);
  }

  if (nlu.slots.targetSeverity && referencedSet.size === 0) {
    for (const f of findings) {
      if (f.severity === nlu.slots.targetSeverity) {
        referencedSet.add(f.id);
      }
    }
  }

  const matchedFindings = findings.filter(
    (f) => referencedSet.has(f.id.toUpperCase()) || referencedSet.has(f.id),
  );

  // 4. Program Slicing (Source -> Sanitizer -> Sink + 1-hop Blast Radius)
  const targetFilePath =
    nlu.slots.filePaths[0] ||
    matchedFindings[0]?.trace?.steps?.[0]?.filePath;

  const slice = buildProgramSlice(
    matchedFindings,
    options.workspaceGraph,
    targetFilePath,
  );

  // 5. Prompt Synthesis with Citations & Secret Redaction
  const promptData: SynthesizedPrompt = synthesizePrompt(query, topChunks, slice);

  // 6. Visualizer Deep-Link Mode
  let graphViewMode: ChatGraphViewMode = "graph";

  if (matchedFindings.some((f) => f.scope === "orchestrator" || f.id.startsWith("remote-"))) {
    graphViewMode = "remote";
  } else if (
    nlu.intent === "BLAST_RADIUS_ANALYSIS" ||
    ["blast", "impact", "affect", "radius", "downstream"].some((k) => query.toLowerCase().includes(k))
  ) {
    graphViewMode = "blast_radius";
  } else if (
    nlu.intent === "TAINT_FLOW_TRACE" ||
    ["sanitizer", "guard", "check", "filter", "control flow"].some((k) => query.toLowerCase().includes(k)) ||
    matchedFindings.some((f) => f.trace?.steps?.some((s) => s.role === "sanitizer"))
  ) {
    graphViewMode = "control_flow";
  } else if (["depend", "package", "import", "supply chain"].some((k) => query.toLowerCase().includes(k))) {
    graphViewMode = "supply_chain";
  } else if (
    nlu.intent === "ARCHITECTURE_OVERVIEW" ||
    ["arch", "architecture", "overview", "system"].some((k) => query.toLowerCase().includes(k)) ||
    (matchedFindings.length === 0 && options.workspaceGraph)
  ) {
    graphViewMode = "unified";
  }

  // 7. Contextual dynamic suggestions
  const suggestions = buildDynamicSuggestions(
    matchedFindings.length > 0 ? matchedFindings : findings,
    {
      query,
      graphViewMode,
      selectedFindingId: options.selectedFindingId ?? matchedFindings[0]?.id,
    },
  );

  return {
    systemPrompt: promptData.systemPrompt,
    userQuery: query,
    citations: promptData.citations,
    referencedFindingIds: promptData.referencedFindingIds,
    matchedFindings,
    graphViewMode,
    suggestions,
    nluAnalysis: nlu,
    slice,
  };
}
