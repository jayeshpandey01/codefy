import { describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "@whoami/types";
import {
  handleOrchestratorMessage,
  ORCHESTRATOR_REQUEST_TYPES,
} from "../../orchestrator/bridge-router.js";
import type { ScanOrchestratorClient } from "../../orchestrator/client.js";

function stubClient(overrides: Partial<Record<keyof ScanOrchestratorClient, unknown>>) {
  return overrides as unknown as ScanOrchestratorClient;
}

describe("handleOrchestratorMessage", () => {
  it("dispatches a request to the client and posts the matching result with the same requestId", async () => {
    const target = { id: "t-1", value: "example.com" };
    const registerTarget = vi.fn().mockResolvedValue(target);
    const post = vi.fn();

    const handled = await handleOrchestratorMessage(
      () => stubClient({ registerTarget }),
      {
        type: "register-target-request",
        target: { value: "example.com" },
        requestId: "r-1",
      } as unknown as BridgeMessage,
      post,
    );

    expect(handled).toBe(true);
    expect(registerTarget).toHaveBeenCalledWith({ value: "example.com" });
    expect(post).toHaveBeenCalledExactlyOnceWith({
      type: "register-target-result",
      target,
      requestId: "r-1",
    });
  });

  it("passes idempotency keys through on submit", async () => {
    const submitSastScan = vi.fn().mockResolvedValue({ id: "s-1" });
    const post = vi.fn();

    await handleOrchestratorMessage(
      () => stubClient({ submitSastScan }),
      {
        type: "submit-sast-scan-request",
        scan: { target_id: "t-1", profile: "sast-quick" },
        idempotencyKey: "idem-1",
        requestId: "r-2",
      } as unknown as BridgeMessage,
      post,
    );

    expect(submitSastScan).toHaveBeenCalledWith(
      { target_id: "t-1", profile: "sast-quick" },
      "idem-1",
    );
  });

  it("streams poll-remote-scans-progress under the pollId before the final result", async () => {
    const pollScansUntilComplete = vi.fn(async (_ids: string[], opts: { onProgress: (s: unknown[]) => void }) => {
      opts.onProgress([{ id: "a", status: "running" }]);
      return [{ scan: { id: "a", status: "completed" } }];
    });
    const post = vi.fn();

    await handleOrchestratorMessage(
      () => stubClient({ pollScansUntilComplete }),
      {
        type: "poll-remote-scans-request",
        scanIds: ["a"],
        kind: "dast",
        pollId: "p-1",
        requestId: "r-3",
      } as unknown as BridgeMessage,
      post,
    );

    expect(post.mock.calls.map(([m]) => m.type)).toEqual([
      "poll-remote-scans-progress",
      "poll-remote-scans-result",
    ]);
    expect(post.mock.calls[0]![0]).toMatchObject({ pollId: "p-1" });
    expect(post.mock.calls[1]![0]).toMatchObject({ requestId: "r-3" });
  });

  it("lets client errors propagate so the host can map them to an error message", async () => {
    const getStats = vi.fn().mockRejectedValue(new Error("401 unauthorized"));
    const post = vi.fn();

    await expect(
      handleOrchestratorMessage(
        () => stubClient({ getStats }),
        { type: "get-platform-stats-request", requestId: "r-4" } as BridgeMessage,
        post,
      ),
    ).rejects.toThrow("401 unauthorized");
    expect(post).not.toHaveBeenCalled();
  });

  it("returns false, posts nothing, and never builds a client for non-orchestrator messages", async () => {
    const post = vi.fn();
    const getClient = vi.fn(() => stubClient({}));

    const handled = await handleOrchestratorMessage(
      getClient,
      { type: "get-trace-request", findingId: "f-1", requestId: "r-5" } as BridgeMessage,
      post,
    );

    expect(handled).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(getClient).not.toHaveBeenCalled();
  });

  it("dispatches every type in ORCHESTRATOR_REQUEST_TYPES (catches a type listed without a case)", async () => {
    // Any method returns a resolved stub, so every case can complete. `then`
    // stays undefined so `await getClient()` doesn't treat it as a thenable.
    const anyClient = new Proxy(
      {},
      { get: (_t, prop) => (prop === "then" ? undefined : async () => ({ scan: {}, result: null })) },
    ) as ScanOrchestratorClient;

    for (const type of ORCHESTRATOR_REQUEST_TYPES) {
      const post = vi.fn();
      const handled = await handleOrchestratorMessage(
        () => anyClient,
        { type, requestId: "r", scanIds: [] } as unknown as BridgeMessage,
        post,
      );
      expect({ type, handled }).toEqual({ type, handled: true });
      expect(post).toHaveBeenCalled();
    }
  });

  it("accepts an async client factory and surfaces its errors", async () => {
    const post = vi.fn();
    await expect(
      handleOrchestratorMessage(
        async () => {
          throw new Error("disallowed orchestrator URL");
        },
        { type: "list-targets-request", requestId: "r-6" } as unknown as BridgeMessage,
        post,
      ),
    ).rejects.toThrow("disallowed orchestrator URL");
  });
});
