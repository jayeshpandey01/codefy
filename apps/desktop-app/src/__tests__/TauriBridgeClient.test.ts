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
vi.mock("../db/authRepo.js", () => ({
  getAuthSession: async () => authSession,
  clearAuthSession: vi.fn(async () => {}),
}));
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
    expect(String(url)).toMatch(/^https:\/\/sast-dutn\.onrender\.com\//);
    expect((init as RequestInit).headers).toMatchObject({
      "X-API-Key": "Jf2T0sTy0IauJ6ELjLWAibC9-EpFo5LXwneztTBeyAU",
    });
  });

  it("handles target registration directly and sends admin requests with admin credentials", async () => {
    tauriFetch.mockResolvedValue(jsonResponse([{ id: "audit-1" }]));
    const bridge = new TauriBridgeClient();

    const regRes = await bridge.request<BridgeMessage, BridgeMessage>({
      type: "register-target-request",
      target: {
        value: "example.com",
        owner_reference: "Test User",
        authorization_reference: "AUTH-TEST-1",
        authorization_confirmed: true,
      },
    } as unknown as BridgeMessage);

    expect(regRes.type).toBe("register-target-result");
    expect((regRes as any).target?.value).toBe("example.com");

    const auditRes = await bridge.request<BridgeMessage, BridgeMessage>({
      type: "list-audit-events-request",
    } as BridgeMessage);

    expect(auditRes.type).toBe("list-audit-events-result");
    expect(tauriFetch).toHaveBeenCalledOnce();
    const [url, init] = tauriFetch.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/sast-dutn\.onrender\.com\//);
    expect((init as RequestInit).headers).toMatchObject({
      "X-API-Key": "nBK_0V8AQVDZmC6gTpgkTn04t7Gx2IYSYiPvdT5zymU",
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

  it("identifies expired sessions and marks them with session_expired error code", async () => {
    tauriFetch.mockResolvedValue(
      jsonResponse({ detail: "Session has expired or token is invalid." }, 401),
    );
    const bridge = new TauriBridgeClient();
    const errors: BridgeMessage[] = [];
    bridge.on("error", (m) => errors.push(m));

    await expect(
      bridge.request({ type: "list-scans-request", requestId: "r-expired" } as BridgeMessage),
    ).rejects.toThrow();
    expect(errors[0]).toMatchObject({
      type: "error",
      requestId: "r-expired",
      statusCode: 401,
      code: "session_expired",
    });
  });
});
