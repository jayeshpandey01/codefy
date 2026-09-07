import type { ChatResult, Finding, WorkspaceGraph } from "@whoami/types";
import { runChatQuery, type ExecuteQueryOptions } from "../query/executor.js";

export interface HostedLlmClientOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface SecurityAnalyzePayload {
  query: string;
  findings: Array<{
    id: string;
    title?: string;
    severity?: string;
    status?: string;
    ruleId?: string;
    cwe?: string;
    filePath?: string;
    line?: number;
    code?: string;
    reason?: string;
    hint?: string;
    fix?: string;
  }>;
  selected_finding_id?: string;
}

export class HostedLlmClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HostedLlmClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:8000").replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 30000;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  /**
   * Calls the hosted LLM service (/api/security/analyze) with RAG context.
   * If the service is offline or errors, falls back to deterministic analysis.
   */
  async analyzeSecurity(
    query: string,
    findings: readonly Finding[],
    options: ExecuteQueryOptions = {},
  ): Promise<ChatResult> {
    const payload: SecurityAnalyzePayload = {
      query,
      findings: findings.map((f) => ({
        id: f.id,
        title: f.title,
        severity: f.severity,
        status: f.status,
        ruleId: f.ruleId,
        cwe: f.cwe,
        filePath: f.trace?.steps?.[f.trace.steps.length - 1]?.filePath,
        line: f.trace?.steps?.[f.trace.steps.length - 1]?.line,
        code: f.code,
        reason: f.reason,
        hint: f.hint,
        fix: f.fix,
      })),
      selected_finding_id: options.selectedFindingId,
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await this.fetchImpl(`${this.baseUrl}/api/security/analyze`, {
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
        throw new Error(`Hosted LLM responded with HTTP ${res.status}`);
      }

      const data = await res.json();
      const referencedIds: string[] = data.referenced_finding_ids || [];
      const matchedFindings = findings.filter((f) => referencedIds.includes(f.id));

      return {
        capability: "SUPPORTED",
        findings: matchedFindings.length > 0 ? matchedFindings : (options.selectedFindingId ? findings.filter(f => f.id === options.selectedFindingId) : []),
        graphViewMode: matchedFindings.length > 0 ? "graph" : undefined,
        explanation: data.reply,
        suggestions: data.suggested_actions || ["How do I fix this?", "Show critical findings"],
      };
    } catch (err: any) {
      // Graceful fallback to deterministic analysis when hosted LLM is unreachable
      const fallbackResult = runChatQuery(query, findings, options);
      if (fallbackResult.capability === "UNSUPPORTED") {
        return {
          capability: "PARTIALLY_SUPPORTED",
          findings: [],
          explanation: `Notice: Hosted LLM at ${this.baseUrl} was unreachable (${err?.message || "network error"}).\n\nFallback: ${fallbackResult.explanation}`,
          suggestions: fallbackResult.suggestions,
        };
      }
      return fallbackResult;
    }
  }

  /**
   * Universal general-purpose query endpoint for any prompt.
   */
  async query(prompt: string, context?: string): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { "X-API-Key": this.apiKey } : {}),
      },
      body: JSON.stringify({ query: prompt, context }),
    });

    if (!res.ok) {
      throw new Error(`Hosted LLM HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.reply;
  }
}
