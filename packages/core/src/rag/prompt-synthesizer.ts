/**
 * Grounded Prompt Synthesizer with Numbered Citations & Secret Redaction
 *
 * Implements:
 * - High-density security auditor system instructions (< 120 words).
 * - Numbered citation tags [1], [2] matching context chunks.
 * - Strict closed-world grounding rules.
 * - Secret sanitization to prevent data leakage (AWS keys, Bearer tokens, passwords).
 */

import type { RagCitation } from "@whoami/types";
import type { ScoredOkfChunk } from "./okf-bm25-retriever.js";
import type { ProgramSlice } from "./program-slicer.js";
import { sanitizeString } from "../logging/redactor.js";

export interface SynthesizedPrompt {
  readonly systemPrompt: string;
  readonly citations: readonly RagCitation[];
  readonly referencedFindingIds: readonly string[];
  readonly estimatedContextTokens: number;
}

export const BASE_SECURITY_SYSTEM_PROMPT = `You are Codefy Security Intelligence AI, an expert application security auditor.
Provide concise, evidence-grounded vulnerability triage, taint trace analysis, and remediation diffs.

RULES:
1. GROUNDING: Assert facts ONLY from verified <context>. If absent or unknown, state "Not detected in current scan". Never invent files, CWEs, or line numbers.
2. CITATIONS: Cite evidence using [1], [2] matching citation tags in <context>. Always reference finding IDs (e.g. F-10291).
3. CWE = CATEGORY: "CWE-NNN" may match several citations (check each "CWE:" field) — never claim nothing was found for lacking that literal id.
4. REMEDIATIONS: Always end with a fix, from the citation's "Remediation:"/"Fix:" field, or an exact before/after diff if asked.
5. STYLE: Technical, direct, actionable. No filler.`;

/**
 * Builds a high-precision, grounded system prompt with numbered citations,
 * anti-hallucination guardrails, and secret redaction to prevent data leakage.
 */
export function synthesizePrompt(
  query: string,
  topChunks: readonly ScoredOkfChunk[],
  slice?: ProgramSlice,
): SynthesizedPrompt {
  const citations: RagCitation[] = [];
  const referencedFindingIds = new Set<string>();
  const citationBlocks: string[] = [];

  topChunks.slice(0, 3).forEach((scored, idx) => {
    const citationIndex = idx + 1;
    const { chunk, score } = scored;

    if (chunk.findingId) {
      referencedFindingIds.add(chunk.findingId);
    }

    citations.push({
      citationIndex,
      section: chunk.title,
      score,
      filePath: chunk.filePath,
      line: chunk.line,
      findingId: chunk.findingId,
    });

    const fileLocation = chunk.filePath
      ? ` (${chunk.filePath}${chunk.line ? `:${chunk.line}` : ""})`
      : "";

    // Data Leakage Prevention: Sanitize secrets/keys & truncate to 800 chars per chunk
    const sanitizedContent = sanitizeString(chunk.content.slice(0, 800));

    citationBlocks.push(
      `[${citationIndex}] ${chunk.title}${fileLocation}\n${sanitizedContent}`,
    );
  });

  const contextSections: string[] = [];

  if (citationBlocks.length > 0) {
    contextSections.push(citationBlocks.join("\n\n"));
  } else {
    contextSections.push("No direct findings or symbols matched in the local index for this query.");
  }

  if (slice?.sliceMarkdown) {
    contextSections.push(sanitizeString(slice.sliceMarkdown));
    if (slice.focalFindingId) {
      referencedFindingIds.add(slice.focalFindingId);
    }
  }

  const rawContext = contextSections.join("\n\n");
  const systemPrompt = `${BASE_SECURITY_SYSTEM_PROMPT}\n\n<context>\n${rawContext}\n</context>`;

  // Character-to-token heuristic (1 token ≈ 4 characters)
  const estimatedContextTokens = Math.ceil(rawContext.length / 4);

  return {
    systemPrompt,
    citations,
    referencedFindingIds: Array.from(referencedFindingIds),
    estimatedContextTokens,
  };
}
