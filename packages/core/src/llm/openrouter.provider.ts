import {
  type CandidatePath,
  type FindingRef,
  type LlmSanitizerVerdict,
  type UnifiedDiff,
  VercelError,
} from "@whoami/types";

import { Logger } from "../logging/logger.js";
import type { ILlmTriageProvider } from "./provider.js";

const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

interface ClassifyResponseShape {
  readonly safe?: unknown;
  readonly reason?: unknown;
}

interface OpenRouterChatCompletionResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string };
  }>;
}

export interface OpenRouterTriageProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  /** Injectable for tests — defaults to the global `fetch`. Never call the real network in a test. */
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Logger;
}

/**
 * Real, working ILlmTriageProvider for testing — calls OpenRouter's chat
 * completions endpoint. Opt-in via OPENROUTER_API_KEY; see CLAUDE.md's
 * "Phase 1 Scope" for why this is testing-phase wiring, not a production
 * key-storage strategy (that's revisited before any real distribution).
 *
 * Every prompt is built from exactly one CandidatePath — never the source
 * file, never an open-ended "review this code" request. See
 * docs/DETECTION-ENGINE-SPEC.md §A.0 for the research (Purba et al. 2024)
 * behind why that narrowness is what makes this reliable at all.
 */
export class OpenRouterTriageProvider implements ILlmTriageProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: Logger;

  constructor(options: OpenRouterTriageProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env["OPENROUTER_API_KEY"];
    if (!apiKey) {
      throw new VercelError(
        "OpenRouterTriageProvider requires an API key — set OPENROUTER_API_KEY or pass { apiKey }.",
        {
          code: "missing_api_key",
          scope: "llm",
          reason:
            "No OPENROUTER_API_KEY environment variable or constructor option was provided.",
          hint: "Set OPENROUTER_API_KEY in .env or pass { apiKey } in options.",
          fix: "Add OPENROUTER_API_KEY=sk-or-v1-... to your .env file.",
          link: "https://openrouter.ai/keys",
        },
      );
    }
    this.apiKey = apiKey;
    this.model = options.model ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
  }

  async classify(path: CandidatePath): Promise<LlmSanitizerVerdict> {
    let response: Response;
    try {
      response = await this.fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
            { role: "user", content: buildClassifyPrompt(path) },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch {
      // A network failure must never crash the pipeline or be treated as a
      // guess — it resolves exactly like "no LLM configured".
      return { kind: "unresolved" };
    }

    if (!response.ok) {
      return { kind: "unresolved" };
    }

    const content = await extractMessageContent(response);
    if (!content) {
      return { kind: "unresolved" };
    }

    try {
      const parsed = JSON.parse(content) as ClassifyResponseShape;
      if (typeof parsed.safe !== "boolean") {
        return { kind: "unresolved" };
      }
      return {
        kind: "resolved",
        safe: parsed.safe,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    } catch {
      return { kind: "unresolved" };
    }
  }

  async generatePatch(finding: FindingRef): Promise<UnifiedDiff> {
    const response = await this.fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: PATCH_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify(
              { id: finding.id, filePath: finding.filePath },
              null,
              2,
            ),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new VercelError(
        `OpenRouter patch generation failed with status ${response.status}`,
        {
          code: "patch_api_failed",
          scope: "llm",
          statusCode: response.status,
          reason:
            "OpenRouter returned non-200 HTTP status during patch generation.",
          hint: "Check model availability or credit balance on OpenRouter.",
          link: "https://openrouter.ai",
        },
      );
    }

    const content = await extractMessageContent(response);
    if (!content) {
      throw new VercelError("OpenRouter patch generation returned no content", {
        code: "empty_response",
        scope: "llm",
        reason: "Model response choice was empty.",
        hint: "Retry with a different model or verify prompt format.",
      });
    }

    const parsed = JSON.parse(content) as { diff?: unknown };
    if (typeof parsed.diff !== "string") {
      throw new VercelError(
        'OpenRouter patch generation returned a malformed response (missing "diff" string)',
        {
          code: "malformed_diff",
          scope: "llm",
          reason:
            'Response JSON did not match expected schema {"diff": string}.',
          hint: "Check LLM response formatting and system prompt instructions.",
        },
      );
    }

    return { filePath: finding.filePath, diff: parsed.diff };
  }
}

const CLASSIFY_SYSTEM_PROMPT =
  "You classify exactly one static-analysis guard as either a safe sanitizer or not, for " +
  "exactly one candidate taint path. Respond with JSON only, matching exactly this shape: " +
  '{"safe": boolean, "reason": string}. Never respond with anything else.';

const PATCH_SYSTEM_PROMPT =
  "You generate exactly one minimal unified git diff patch that fixes exactly one finding. " +
  'Respond with JSON only, matching exactly this shape: {"diff": string}. Never respond with anything else.';

/**
 * Builds the structured, narrow prompt payload for one CandidatePath — the
 * sink class, the full step-by-step trace, and the one guard snippet in
 * question. Deliberately never includes the whole source file or an
 * open-ended instruction.
 */
function buildClassifyPrompt(path: CandidatePath): string {
  return JSON.stringify(
    {
      sinkClass: path.sinkClass,
      steps: path.steps.map((step) => ({
        role: step.role,
        label: step.label,
        filePath: step.filePath,
        line: step.line,
      })),
      guardSourceSnippet: path.guardSourceSnippet,
      question:
        "Does guardSourceSnippet actually sanitize the tainted value before it reaches the sink?",
    },
    null,
    2,
  );
}

async function extractMessageContent(
  response: Response,
): Promise<string | undefined> {
  const body = (await response.json()) as OpenRouterChatCompletionResponse;
  return body.choices?.[0]?.message?.content;
}
