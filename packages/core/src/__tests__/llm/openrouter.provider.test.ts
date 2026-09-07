import type { CandidatePath, FindingRef } from "@whoami/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenRouterTriageProvider } from "../../llm/openrouter.provider.js";

const SAMPLE_PATH: CandidatePath = {
  id: "src/routes/ssrf.ts:12:js-ssrf-unvalidated-url",
  sinkClass: "ssrf",
  steps: [
    {
      role: "source",
      label: "req.body.url",
      filePath: "src/routes/ssrf.ts",
      line: 4,
    },
    {
      role: "sink",
      label: "fetch(url)",
      filePath: "src/routes/ssrf.ts",
      line: 12,
    },
  ],
  guardSourceSnippet: "function maybeOk(u) { return u.length > 0; }",
};

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response;
}

describe("OpenRouterTriageProvider (mocked fetch — no real network access)", () => {
  const originalApiKey = process.env["OPENROUTER_API_KEY"];

  beforeEach(() => {
    delete process.env["OPENROUTER_API_KEY"];
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env["OPENROUTER_API_KEY"];
    } else {
      process.env["OPENROUTER_API_KEY"] = originalApiKey;
    }
    vi.unstubAllGlobals();
  });

  it("throws if constructed with no API key available (env unset, none passed)", () => {
    expect(() => new OpenRouterTriageProvider()).toThrowError(
      /OPENROUTER_API_KEY/,
    );
  });

  it("classify(): sends a structured, narrow request — correct URL, Authorization header, and a JSON body built from exactly one CandidatePath", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  safe: true,
                  reason: "parameterized",
                }),
              },
            },
          ],
        }),
    );

    const provider = new OpenRouterTriageProvider({
      apiKey: "test-key-123",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const verdict = await provider.classify(SAMPLE_PATH);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.method).toBe("POST");

    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key-123");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    // The user message must be the structured CandidatePath payload, never raw prose /
    // an open-ended "review this code" instruction, per docs/DETECTION-ENGINE-SPEC.md §A.0.
    const payload = JSON.parse(userMessage!.content) as {
      sinkClass: string;
      steps: unknown[];
      guardSourceSnippet: string;
    };
    expect(payload.sinkClass).toBe("ssrf");
    expect(payload.steps).toHaveLength(2);
    expect(payload.guardSourceSnippet).toBe(SAMPLE_PATH.guardSourceSnippet);

    expect(verdict).toEqual({
      kind: "resolved",
      safe: true,
      reason: "parameterized",
    });
  });

  it("classify(): returns unresolved (never throws) when the HTTP call fails", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({}, { ok: false, status: 500 }),
    );
    const provider = new OpenRouterTriageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.classify(SAMPLE_PATH)).resolves.toEqual({
      kind: "unresolved",
    });
  });

  it("classify(): returns unresolved (never throws) when fetch itself rejects", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    const provider = new OpenRouterTriageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.classify(SAMPLE_PATH)).resolves.toEqual({
      kind: "unresolved",
    });
  });

  it("classify(): returns unresolved when the model response is not valid JSON", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "not json" } }] }),
    );
    const provider = new OpenRouterTriageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.classify(SAMPLE_PATH)).resolves.toEqual({
      kind: "unresolved",
    });
  });

  it("generatePatch(): parses a unified diff out of the structured JSON response", async () => {
    const diff = "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-bad\n+good\n";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ diff }) } }],
      }),
    );
    const provider = new OpenRouterTriageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const finding: FindingRef = {
      id: "finding-1",
      filePath: "src/routes/ssrf.ts",
    };
    const result = await provider.generatePatch(finding);

    expect(result).toEqual({ filePath: "src/routes/ssrf.ts", diff });
  });

  it("reads OPENROUTER_API_KEY from the environment when no apiKey option is passed", async () => {
    process.env["OPENROUTER_API_KEY"] = "from-env";
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({ safe: false, reason: "no guard" }),
              },
            },
          ],
        }),
    );

    const provider = new OpenRouterTriageProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.classify(SAMPLE_PATH);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer from-env");
  });
});
