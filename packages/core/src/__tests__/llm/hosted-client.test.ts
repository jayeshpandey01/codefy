import { describe, expect, it, vi } from "vitest";
import { HostedLlmClient } from "../../llm/hosted-client.js";
import { FIXTURE_FINDINGS } from "../query/fixtures.js";

describe("HostedLlmClient with TrainIQ RAG & SSE Streaming", () => {
  it("successfully queries /api/chat with JSON response and zero data leakage", async () => {
    const jsonResponse = {
      response: "finding F-10291 is confirmed because user input reaches db.execute directly.",
      latency_ms: 110,
      tokens_used: 48,
      search_performed: false,
      sources: [],
      provider: "cmd-d_engine",
      model: "cmd-d_llm",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => jsonResponse,
    });

    const client = new HostedLlmClient({
      baseUrl: "https://i8791yv32r8c7t21387rcfvt8713cv.onrender.com",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const chunks: string[] = [];
    const result = await client.streamRagChat(
      "Why is F-10291 confirmed?",
      FIXTURE_FINDINGS,
      {
        workspacePath: "/Users/testuser/Documents/codefy",
      },
      (chunk) => {
        if (chunk.delta) chunks.push(chunk.delta);
      },
    );

    expect(result.capability).toBe("SUPPORTED");
    expect(result.explanation).toContain("finding F-10291 is confirmed");
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.id).toBe("F-10291");
    expect(result.graphViewMode).toBe("graph");
    expect(result.citations?.length).toBeGreaterThanOrEqual(1);
    expect(result.suggestions).toBeDefined();

    // Verify simulated streaming emitted token deltas
    expect(chunks.join("")).toContain("finding F-10291 is confirmed");

    // Verify /api/chat request body strictly matches the required schema
    expect(mockFetch).toHaveBeenCalledWith(
      "https://i8791yv32r8c7t21387rcfvt8713cv.onrender.com/api/chat",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs).toBeDefined();
    const sentPayload = JSON.parse(callArgs![1]!.body as string);

    expect(sentPayload).toEqual({
      query: expect.any(String),
      // Bumped from 512: that budget was measured cutting a multi-finding
      // CWE explanation off mid-sentence before it reached the remediation
      // diff (see hosted-client.ts's comment on this default).
      max_tokens: 1024,
      temperature: 0.7,
      web_search: false, // ZERO DATA LEAKAGE: web_search must be false
      max_search_results: 3,
      language: "auto",
    });

    // Zero data leakage assertions on sent query:
    // 1. Path privacy: No user home directory leaked
    expect(sentPayload.query).not.toContain("/Users/testuser");
    // 2. Secret redaction: No raw AWS keys or secrets leaked
    expect(sentPayload.query).not.toMatch(/AKIA[0-9A-Z]{16}/);
  });

  it("propagates SSE suggestions if supplied by the backend", async () => {
    const sseLines = [
      'data: {"reply": "Analysis ready.", "done": false}\n\n',
      'data: {"reply": "", "done": true, "citations": [], "referenced_finding_ids": [], "suggestions": ["Action A", "Action B"]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const line of sseLines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const client = new HostedLlmClient({
      baseUrl: "http://mock-axiom:8000",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await client.streamRagChat("analyze architecture", FIXTURE_FINDINGS);
    expect(result.suggestions).toEqual(["Action A", "Action B"]);
  });

  it("gracefully falls back to deterministic analysis when backend is unreachable", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const client = new HostedLlmClient({
      baseUrl: "http://offline-service:8000",
      fetchImpl: failingFetch as unknown as typeof fetch,
    });

    const emittedChunks: string[] = [];
    const result = await client.streamRagChat(
      "show critical bugs",
      FIXTURE_FINDINGS,
      {},
      (chunk) => {
        if (chunk.delta) emittedChunks.push(chunk.delta);
      },
    );

    // Deterministic fallback should successfully resolve "show critical bugs"
    expect(result.capability).toBe("SUPPORTED");
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.id).toBe("F-10291");
    expect(emittedChunks.length).toBeGreaterThan(0);
  });

  it("sends zero repository context for GENERAL_ASSISTANCE queries", async () => {
    const jsonResponse = {
      response: "A Python developer designs and builds backend software, web APIs, and data services.",
      latency_ms: 90,
      tokens_used: 25,
      search_performed: false,
      sources: [],
      provider: "cmd-d_engine",
      model: "cmd-d_llm",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => jsonResponse,
    });

    const client = new HostedLlmClient({
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await client.streamRagChat("explain me python developer", FIXTURE_FINDINGS);

    expect(result.capability).toBe("SUPPORTED");
    expect(result.intent).toBe("GENERAL_ASSISTANCE");
    expect(result.findings).toEqual([]);
    expect(result.citations).toEqual([]);

    const callArgs = mockFetch.mock.calls[0];
    const sentPayload = JSON.parse(callArgs![1]!.body as string);

    // Assert query sent is simply the sanitized question without any finding or codebase dumps
    expect(sentPayload.query).toBe("explain me python developer");
    expect(sentPayload.query).not.toContain("<context>");
    expect(sentPayload.query).not.toContain("F-10291");
    expect(sentPayload.web_search).toBe(false);
  });

  it("executes single-prompt query via /api/chat", async () => {
    const jsonResponse = {
      response: "Secure coding best practices require input validation.",
      latency_ms: 80,
      tokens_used: 15,
      search_performed: false,
      sources: [],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => jsonResponse,
    });

    const client = new HostedLlmClient({
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const reply = await client.query("Give me a tip on secure coding.");
    expect(reply).toBe("Secure coding best practices require input validation.");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://i8791yv32r8c7t21387rcfvt8713cv.onrender.com/api/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

