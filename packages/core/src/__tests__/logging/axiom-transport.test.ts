import { describe, expect, it, vi } from "vitest";
import type { LogEvent } from "@whoami/types";
import { AxiomTransport } from "../../logging/transports/axiom.js";

describe("AxiomTransport", () => {
  it("batches and dispatches events to Axiom ingest endpoint with authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const transport = new AxiomTransport({
      apiToken: "test-token",
      dataset: "whoami-logs",
      batchSize: 2,
      flushIntervalMs: 0, // Manual flush
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const event1: LogEvent = {
      level: "info",
      message: "Scan started",
      fields: { scanId: "scan-1" },
      timestamp: "2026-09-01T00:00:00.000Z",
      source: "core-engine",
      platform: { runtime: "node", host: "test", appVersion: "0.1.0" },
    };

    const event2: LogEvent = {
      level: "info",
      message: "Scan completed",
      fields: { scanId: "scan-1", durationMs: 150 },
      timestamp: "2026-09-01T00:00:00.150Z",
      source: "core-engine",
      platform: { runtime: "node", host: "test", appVersion: "0.1.0" },
    };

    // Sending 2 events triggers auto-flush because batchSize is 2
    transport.send([event1, event2]);
    await transport.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = requestInit.headers as Record<string, string>;

    expect(url).toBe("https://api.axiom.co/v1/datasets/whoami-logs/ingest");
    expect(requestInit.method).toBe("POST");
    expect(headers["Authorization"]).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(requestInit.body as string);
    expect(body.length).toBe(2);
    expect(body[0].message).toBe("Scan started");
    expect(body[0]["@app"].name).toBe("whoami");
    expect(body[1].message).toBe("Scan completed");
  });

  it("retries on 429 rate limits or 500 server errors", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500 };
      }
      return { ok: true, status: 200 };
    });

    const transport = new AxiomTransport({
      apiToken: "test-token",
      dataset: "whoami-logs",
      batchSize: 10,
      flushIntervalMs: 0,
      maxRetries: 3,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    transport.send([
      {
        level: "warn",
        message: "High entropy token",
        fields: {},
        timestamp: new Date().toISOString(),
        source: "secrets",
        platform: { runtime: "node", host: "test", appVersion: "0.1.0" },
      },
    ]);

    await transport.flush();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
