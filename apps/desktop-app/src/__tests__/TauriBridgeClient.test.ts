import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "@whoami/types";

const tauriFetch = vi.fn();
const authSession = {
  accessToken: "signed-in-user-token",
  tokenType: "bearer",
  userId: "user-1",
  email: "user@example.test",
  name: "Test User",
  tier: "community" as const,
  expiresAt: Date.now() + 60_000,
};

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => tauriFetch(...args) }));
vi.mock("../db/authRepo.js", () => ({ getAuthSession: async () => authSession }));
vi.mock("../bridge/updater.js", () => ({
  checkForAppUpdate: vi.fn(async () => undefined),
  checkForVersionChange: vi.fn(async () => null),
  installPendingUpdate: vi.fn(),
  restartApp: vi.fn(),
}));
vi.mock("../bridge/workspaceFs.js", () => ({}));
vi.mock("../bridge/engineWorker.js", () => ({}));

const { TauriBridgeClient } = await import("../bridge/TauriBridgeClient.js");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TauriBridgeClient orchestrator requests", () => {
  beforeEach(() => {
    tauriFetch.mockReset();
  });

  it("sends orchestrator requests with the backend api key", async () => {
    tauriFetch.mockResolvedValue(jsonResponse([{ id: "t-1" }]));
    const bridge = new TauriBridgeClient();

    // list-scans is an operator endpoint (targets need the admin key).
    const res = await bridge.request<BridgeMessage, BridgeMessage>({
      type: "list-scans-request",
    } as BridgeMessage);

    expect(res.type).toBe("list-scans-result");
    expect(tauriFetch).toHaveBeenCalledOnce();
    const [url, init] = tauriFetch.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/axiom-xjkc\.onrender\.com\//);
    expect((init as RequestInit).headers).toMatchObject({
      "X-API-Key": "Jf2T0sTy0IauJ6ELjLWAibC9-EpFo5LXwneztTBeyAU",
    });
  });

  it("handles target registration directly through backend credentials", async () => {
    tauriFetch.mockResolvedValue(jsonResponse({ id: "t-1" }));
    const bridge = new TauriBridgeClient();

    await bridge.request({
      type: "register-target-request",
      target: {
        value: "example.com",
        owner_reference: "Test User",
        authorization_reference: "AUTH-TEST-1",
        authorization_confirmed: true,
      },
    } as unknown as BridgeMessage);

    expect((tauriFetch.mock.calls[0]![1] as RequestInit).headers).toMatchObject({
      "X-API-Key": "Jf2T0sTy0IauJ6ELjLWAibC9-EpFo5LXwneztTBeyAU",
    });
  });

  it("maps HTTP errors to an error message carrying the requestId", async () => {
    tauriFetch.mockResolvedValue(jsonResponse({ detail: "invalid api key" }, 401));
    const bridge = new TauriBridgeClient();
    const errors: BridgeMessage[] = [];
    bridge.on("error", (m) => errors.push(m));

    await expect(
      bridge.request({ type: "list-scans-request", requestId: "r-401" } as BridgeMessage),
    ).rejects.toThrow();
    expect(errors[0]).toMatchObject({ type: "error", requestId: "r-401", statusCode: 401 });
  });
});
