import type {
  ChatGraphViewMode,
  ChatResult,
  Finding,
  OkfBundle,
  RagCitation,
  StreamingChatChunk,
} from "@whoami/types";
import {
  runChatQuery,
  buildDynamicSuggestions,
  type ExecuteQueryOptions,
} from "../query/executor.js";
import { generateOkfBundle } from "../okf/generator.js";
import { executeRagRetrieval, verifyLlmResponse } from "../rag/index.js";
import { maskAbsolutePaths, sanitizeString } from "../logging/redactor.js";

export const DEFAULT_AI_GATEWAY_URL = "https://cmd-d-llm.vercel.app";

export interface HostedLlmClientOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  /** Admin secret for the Alerts & Issues API (see reportAlert below). Falls
   * back to the TRAINIQ_ADMIN_SECRET env var where `process` exists (Node
   * extension host); undefined in the wasm/browser build, where alerting is
   * simply skipped -- this is a testing-phase credential, same caveat as
   * OPENROUTER_API_KEY in CLAUDE.md's Phase 1 Scope section. */
  readonly adminSecret?: string;
}

export interface AlertCreateRequest {
  readonly title: string;
  readonly paragraph?: string;
  readonly severity?: "info" | "warning" | "error" | "critical";
  readonly category?:
    | "backend_failure"
    | "latency_spike"
    | "security_anomaly"
    | "model_error"
    | "client_issue"
    | "general";
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
  readonly notify_admin?: boolean;
}

export interface AlertResponse {
  readonly alert_id: string;
  readonly status: string;
  readonly title: string;
  readonly paragraph: string;
  readonly severity: string;
  readonly category: string;
  readonly created_at: number;
  readonly message: string;
}

export interface AiChatQueryRequest {
  readonly query: string;
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly web_search?: boolean;
  readonly max_search_results?: number;
  readonly language?: "en" | "hi" | "mr" | "auto";
}

export interface AiChatQueryResponse {
  readonly response: string;
  readonly latency_ms: number;
  readonly tokens_used?: number;
  readonly search_performed?: boolean;
  readonly sources?: readonly Record<string, unknown>[];
  readonly reply?: string;
  readonly provider?: string;
  readonly model?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatGraphViewMode(value: unknown): value is ChatGraphViewMode {
  return (
    typeof value === "string" &&
    ["graph", "unified", "blast_radius", "control_flow", "supply_chain", "remote"].includes(value)
  );
}

export interface StreamRagChatOptions extends ExecuteQueryOptions {
  readonly okfBundle?: OkfBundle;
  readonly workspacePath?: string;
  readonly model?: string;
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly web_search?: boolean;
  readonly max_search_results?: number;
  readonly language?: "en" | "hi" | "mr" | "auto";
}

export class HostedLlmClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly adminSecret?: string;

  constructor(options: HostedLlmClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_AI_GATEWAY_URL).replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 30000;
    // Bind to globalThis -- native browser `fetch` is branded to its
    // global and throws "Illegal invocation" if called as `this.fetchImpl(...)`
    // with an unbound reference. Node's fetch doesn't enforce this, so the
    // bug only shows up once this client actually runs in a browser/webview.
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
    this.adminSecret =
      options.adminSecret ||
      (typeof process !== "undefined"
        ? process.env?.["TRAINIQ_ADMIN_SECRET"]
        : undefined);
  }

  /**
   * Reports an operational issue to the gateway's Alerts & Issues API
   * (`POST /api/alerts`), which stores it and dispatches an admin
   * notification server-side -- deliberately the *non*-manual endpoint,
   * since `/api/alerts/manual` explicitly bypasses deduplication and would
   * spam admins once per failed chat turn during an outage.
   *
   * Fire-and-forget by design: callers must never let an alerting failure
   * mask or replace the original error they were reporting.
   */
  async reportAlert(alert: AlertCreateRequest): Promise<AlertResponse | null> {
    if (!this.adminSecret) return null;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": this.adminSecret,
        },
        body: JSON.stringify({ source: "codefy-chat-gateway", ...alert }),
      });
      if (!res.ok) return null;
      return (await res.json()) as AlertResponse;
    } catch {
      return null;
    }
  }

  /**
   * Indexes the current workspace's OKF documents into the backend RAG engine (TrainIQ).
   */
  async indexOkf(bundle: OkfBundle): Promise<{ success: boolean; indexedCount: number; message: string }> {
    const docs = [
      bundle.repository,
      bundle.architecture,
      bundle.securityFindings,
      bundle.services,
    ].filter(Boolean);

    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/rag/index-okf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-API-Key": this.apiKey, Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          workspace_path: bundle.workspacePath,
          documents: docs,
        }),
      });

      if (!res.ok) {
        throw new Error(`Indexing HTTP ${res.status}`);
      }

      const data = await res.json();
      return {
        success: true,
        indexedCount: data.indexed_count ?? docs.length,
        message: data.message ?? "Indexed successfully",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      return {
        success: false,
        indexedCount: 0,
        message: `Failed to index OKF: ${msg}`,
      };
    }
  }

  /**
   * Interactive real-time SSE streaming RAG query.
   * Grounded in OKF knowledge and TrainIQ vectorless retrieval.
   * Emits progressive token deltas through `onChunk`, and returns the final ChatResult.
   */
  async streamRagChat(
    query: string,
    findings: readonly Finding[],
    options: StreamRagChatOptions = {},
    onChunk?: (chunk: StreamingChatChunk) => void,
  ): Promise<ChatResult> {
    // 1. In-memory, sub-millisecond Graph-Augmented Vectorless RAG retrieval (< 1ms)
    const retrieval = executeRagRetrieval(query, findings, {
      workspaceGraph: options.workspaceGraph,
      okfBundle: options.okfBundle,
      selectedFindingId: options.selectedFindingId,
    });

    // 2. Data Leakage Prevention & Prompt Formatting
    const isGeneral = retrieval.nluAnalysis.intent === "GENERAL_ASSISTANCE";
    let formattedPrompt: string;

    if (isGeneral) {
      // General concept / developer question: ZERO codebase context transmitted
      formattedPrompt = sanitizeString(query);
    } else {
      // Security / code analysis query: bounded context with strict secret redaction & path privacy
      const sanitizedSystemPrompt = sanitizeString(
        maskAbsolutePaths(retrieval.systemPrompt, options.workspacePath),
      );
      formattedPrompt = `${sanitizedSystemPrompt}\n\nUser Question: ${sanitizeString(query)}`;
    }

    const payload: AiChatQueryRequest = {
      query: formattedPrompt,
      // 512 was measured to cut a multi-finding CWE explanation off
      // mid-sentence right before the remediation diff it was building
      // toward -- a triage table + taint trace for 2+ findings alone can
      // exceed 512 tokens, leaving nothing for the "how do I fix it" part
      // the user actually asked for.
      max_tokens: options.max_tokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      web_search: false, // STRICT: Prevent DuckDuckGo from receiving queries or code snippets
      max_search_results: options.max_search_results ?? 3,
      language: options.language ?? "auto",
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      // Call public /api/chat endpoint
      const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "X-API-Key": this.apiKey, Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Hosted AI responded with HTTP ${res.status}`);
      }

      let accumulatedReply = "";
      let finalCitations = [...retrieval.citations];
      let finalReferencedIds = [...retrieval.referencedFindingIds];
      let finalGraphViewMode: ChatGraphViewMode = retrieval.graphViewMode;
      let finalSuggestions = [...retrieval.suggestions];

      const contentType = res.headers?.get("content-type") || "";
      const isSse =
        contentType.includes("text/event-stream") ||
        (Boolean(res.body) && typeof res.json !== "function");

      if (isSse) {
        // SSE streaming
        await this.readSse(res, (data) => {
          const delta =
            (typeof data.reply === "string" && data.reply) ||
            (typeof data.response === "string" && data.response) ||
            "";
          if (delta) {
            accumulatedReply += delta;
            onChunk?.({
              delta,
              done: false,
            });
          }
          if (data.done === true) {
            if (Array.isArray(data.citations) && data.citations.length > 0) {
              finalCitations = data.citations.flatMap((value: unknown): RagCitation[] => {
                if (!isRecord(value)) return [];
                const citationIndex = value["citation_index"] ?? value["citationIndex"];
                const section = value["section"];
                const score = value["score"];
                const filePath = value["file_path"] ?? value["filePath"];
                const line = value["line"];
                const findingId = value["finding_id"] ?? value["findingId"];
                return [{
                  citationIndex: typeof citationIndex === "number" ? citationIndex : 1,
                  section: typeof section === "string" ? section : "",
                  ...(typeof score === "number" ? { score } : {}),
                  ...(typeof filePath === "string" ? { filePath } : {}),
                  ...(typeof line === "number" ? { line } : {}),
                  ...(typeof findingId === "string" ? { findingId } : {}),
                }];
              });
            }
            if (Array.isArray(data.referenced_finding_ids) && data.referenced_finding_ids.length > 0) {
              finalReferencedIds = data.referenced_finding_ids.filter(
                (value): value is string => typeof value === "string",
              );
            }
            if (isChatGraphViewMode(data.graph_view_mode)) {
              finalGraphViewMode = data.graph_view_mode;
            }
            if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
              finalSuggestions = data.suggestions.filter(
                (value): value is string => typeof value === "string",
              );
            }

            onChunk?.({
              delta: "",
              done: true,
              citations: isGeneral ? [] : finalCitations,
              referencedFindingIds: isGeneral ? [] : finalReferencedIds,
              graphViewMode: finalGraphViewMode,
              suggestions: finalSuggestions,
            });
          }
        });
      } else {
        // Standard JSON response
        const data: AiChatQueryResponse = await res.json();
        accumulatedReply = data.response || data.reply || "";

        // Emit simulated streaming bursts for smooth UI typing animation
        if (onChunk && accumulatedReply) {
          const words = accumulatedReply.split(" ");
          for (let i = 0; i < words.length; i += 4) {
            const chunkText = words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "");
            onChunk({
              delta: chunkText,
              done: false,
            });
          }
          onChunk({
            delta: "",
            done: true,
            citations: isGeneral ? [] : finalCitations,
            referencedFindingIds: isGeneral ? [] : finalReferencedIds,
            graphViewMode: finalGraphViewMode,
            suggestions: finalSuggestions,
          });
        }
      }

      const matchedFindings = findings.filter(
        (f) =>
          finalReferencedIds.includes(f.id) ||
          (options.selectedFindingId && f.id === options.selectedFindingId),
      );

      const guardResult = verifyLlmResponse(accumulatedReply, {
        findings,
        graph: options.workspaceGraph,
      });

      return {
        capability: "SUPPORTED",
        intent: retrieval.nluAnalysis.intent,
        findings: isGeneral ? [] : (matchedFindings.length > 0 ? matchedFindings : retrieval.matchedFindings),
        graphViewMode: finalGraphViewMode,
        targetFilePath: retrieval.nluAnalysis.slots.filePaths[0],
        explanation: guardResult.sanitizedText || "Query completed with no generated output.",
        citations: isGeneral ? [] : finalCitations,
        suggestions: finalSuggestions,
      };
    } catch (err: unknown) {
      // Graceful offline fallback: use grounded local analysis
      const fallbackResult = runChatQuery(query, findings, options);
      const errMsg = err instanceof Error ? err.message : "network error";

      // Fire-and-forget: report the gateway being unreachable so an admin
      // gets notified, without ever blocking or replacing the local fallback
      // response above with an alerting failure of our own.
      void this.reportAlert({
        title: "TrainIQ chat gateway unreachable",
        paragraph: `streamRagChat() failed against ${this.baseUrl}/api/chat: ${errMsg}. Client fell back to local deterministic analysis.`,
        severity: "warning",
        category: "backend_failure",
        metadata: { baseUrl: this.baseUrl, error: errMsg },
      });

      // Deliberately doesn't include this.baseUrl or the raw errMsg in the
      // user-facing notice -- those go to reportAlert() above (our own
      // ops-facing telemetry) instead, never rendered into a chat message a
      // user could see or screenshot. See the data-sharing/security review
      // this fix came from: backend endpoints must never appear in output
      // a user can see, even in error/notice text.
      const explanation =
        fallbackResult.capability === "UNSUPPORTED"
          ? `**Notice:** The cloud AI service is unreachable right now — falling back to local analysis.\n\n### Grounded Local Analysis:\n${retrieval.systemPrompt.replace(/^You are the Codefy Security & Code Intelligence AI Assistant\.\nYou provide precise, evidence-grounded security triage, architecture analysis, and remediation diffs\.\n\n/, "")}`
          : fallbackResult.explanation;

      onChunk?.({
        delta: explanation || "",
        done: true,
        citations: retrieval.citations,
        referencedFindingIds: retrieval.referencedFindingIds,
        graphViewMode: retrieval.graphViewMode,
        suggestions: retrieval.suggestions,
      });

      const isGeneral = fallbackResult.intent === "GENERAL_ASSISTANCE";
      const fallbackFindings =
        fallbackResult.findings && fallbackResult.findings.length > 0
          ? fallbackResult.findings
          : isGeneral
            ? []
            : retrieval.matchedFindings;

      return {
        capability: "SUPPORTED",
        intent: fallbackResult.intent,
        findings: fallbackFindings,
        graphViewMode: fallbackResult.graphViewMode ?? retrieval.graphViewMode,
        targetFilePath: fallbackResult.targetFilePath,
        explanation,
        citations: isGeneral ? [] : (fallbackResult.citations ?? retrieval.citations),
        suggestions: fallbackResult.suggestions ?? retrieval.suggestions,
      };
    }
  }


  /**
   * Universal general-purpose query endpoint for any prompt.
   */
  async query(prompt: string, context?: string): Promise<string> {
    const sanitizedPrompt = sanitizeString(context ? `${context}\n\n${prompt}` : prompt);
    const payload: AiChatQueryRequest = {
      query: sanitizedPrompt,
      max_tokens: 512,
      temperature: 0.7,
      web_search: false,
      max_search_results: 3,
      language: "auto",
    };

    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "X-API-Key": this.apiKey, Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Hosted LLM HTTP ${res.status}`);
    }

    const data: AiChatQueryResponse = await res.json();
    return data.response || data.reply || "";
  }

  /**
   * Cross-platform SSE decoder compatible with Webview/Tauri ReadableStream and Node.js streams.
   */
  private async readSse(
    res: Response,
    onPayload: (data: Record<string, unknown>) => void,
  ): Promise<void> {
    if (!res.body) return;

    const body = res.body as ReadableStream<Uint8Array> &
      Partial<AsyncIterable<Uint8Array | string>>;
    if (typeof body.getReader === "function") {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const raw = trimmed.slice(6);
            if (raw === "[DONE]") return;
            try {
              const payload: unknown = JSON.parse(raw);
              if (isRecord(payload)) onPayload(payload);
            } catch {
              // ignore partial or malformed chunk
            }
          }
        }
      }
    } else if (typeof body[Symbol.asyncIterator] === "function") {
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
        buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const raw = trimmed.slice(6);
            if (raw === "[DONE]") return;
            try {
              const payload: unknown = JSON.parse(raw);
              if (isRecord(payload)) onPayload(payload);
            } catch {
              // ignore partial chunk
            }
          }
        }
      }
    }
  }
}
