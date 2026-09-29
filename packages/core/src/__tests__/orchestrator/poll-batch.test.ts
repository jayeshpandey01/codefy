import { describe, expect, it, vi } from "vitest";
import { OrchestratorApiError, ScanOrchestratorClient } from "../../orchestrator/client.js";

type Status = "queued" | "running" | "completed" | "failed";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { "content-type": "application/json", ...headers };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => all[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

function scan(id: string, status: Status) {
  return {
    id,
    target_id: "target-1",
    profile: "recon",
    status,
    controller_job_id: null,
    failure_reason: null,
    created_at: "2026-09-01T00:00:00Z",
  };
}

function result(id: string) {
  return {
    id: `res-${id}`,
    scan_job_id: id,
    summary: { findings: [] },
    created_at: "2026-09-01T00:00:00Z",
    artifact: null,
    error_logs: null,
  };
}

function client(fetchFn: unknown) {
  return new ScanOrchestratorClient({
    baseUrl: "https://test-orchestrator.local",
    apiKey: "operator-key-1",
    fetchFn: fetchFn as typeof fetch,
  });
}

describe("pollScansUntilComplete", () => {
  it("polls every scan of a run with one list request per tick", async () => {
    let tick = 0;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/result")) {
        const id = url.split("/v1/scans/")[1]!.split("/")[0]!;
        return jsonResponse(result(id));
      }
      tick += 1;
      // an older scan on the same target must be ignored
      return jsonResponse([
        scan("a", tick >= 2 ? "completed" : "running"),
        scan("b", tick >= 3 ? "completed" : "running"),
        scan("c", tick >= 3 ? "failed" : "queued"),
        scan("old", "completed"),
      ]);
    });

    const polled = await client(fetchFn).pollScansUntilComplete(["a", "b", "c"], {
      targetId: "target-1",
      intervalMs: 5,
    });

    expect(polled.map((p) => [p.scan.id, p.scan.status])).toEqual([
      ["a", "completed"],
      ["b", "completed"],
      ["c", "failed"],
    ]);
    expect(polled[0]!.result?.id).toBe("res-a");
    const statusCalls = fetchFn.mock.calls.filter(([u]) => !String(u).includes("/result"));
    expect(statusCalls).toHaveLength(3); // 3 ticks, not 3 ticks x 3 scans
    expect(String(statusCalls[0]![0])).toContain("/v1/scans?target_id=target-1");
    // each terminal scan's result is fetched exactly once, the old scan's never
    const resultCalls = fetchFn.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/result"));
    expect(resultCalls.sort()).toEqual([
      "https://test-orchestrator.local/v1/scans/a/result",
      "https://test-orchestrator.local/v1/scans/b/result",
      "https://test-orchestrator.local/v1/scans/c/result",
    ]);
  });

  it("retries through a 429 (honouring Retry-After) instead of aborting", async () => {
    vi.useFakeTimers();
    try {
      let call = 0;
      const fetchFn = vi.fn(async (url: string) => {
        if (url.endsWith("/result")) return jsonResponse(result("a"));
        call += 1;
        if (call === 1) return jsonResponse({ detail: "request rate limit exceeded" }, 429, { "retry-after": "3" });
        return jsonResponse(scan("a", "completed"));
      });

      const pending = client(fetchFn).pollScansUntilComplete(["a"], { intervalMs: 10 });
      await vi.advanceTimersByTimeAsync(2000);
      expect(call).toBe(1); // still waiting out Retry-After (3s, ±20% jitter)
      await vi.advanceTimersByTimeAsync(2000);
      const [polled] = await pending;
      expect(polled!.scan.status).toBe("completed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry non-transient errors", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ detail: "scan not found" }, 404));
    await expect(client(fetchFn).pollScansUntilComplete(["missing"], { intervalMs: 5 })).rejects.toBeInstanceOf(
      OrchestratorApiError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("backs off while nothing changes and snaps back when a status changes", async () => {
    const sleeps: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
      sleeps.push(ms ?? 0);
      return realSetTimeout(fn, 0);
    }) as typeof setTimeout);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // no jitter
    try {
      const statuses: Status[] = ["running", "running", "running", "running", "completed"];
      let i = 0;
      const fetchFn = vi.fn(async (url: string) =>
        url.endsWith("/result") ? jsonResponse(result("a")) : jsonResponse(scan("a", statuses[i++]!)),
      );
      await client(fetchFn).pollScansUntilComplete(["a"], { intervalMs: 1000, maxIntervalMs: 2000 });
      // first tick changed (unknown -> running): base; then x1.5 per quiet tick, capped
      expect(sleeps).toEqual([1000, 1500, 2000, 2000]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
