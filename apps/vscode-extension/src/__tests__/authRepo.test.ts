import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, BridgeMessage } from "@whoami/types";
import type { BridgeClient } from "@whoami/ui";

const dbGet = vi.fn<(...args: [string, string]) => Promise<{ key: string; value: AuthSession } | undefined>>();
const dbDelete = vi.fn<(...args: [string, string]) => Promise<void>>(async () => undefined);
vi.mock("../db/database.js", () => ({
  dbGet: (...args: [string, string]) => dbGet(...args),
  dbDelete: (...args: [string, string]) => dbDelete(...args),
  STORES: { KV_STORE: "kv_store" },
}));

const { clearAuthSession, getAuthSession, initAuthSessionStore, saveAuthSession } =
  await import("../db/authRepo.js");

const session: AuthSession = {
  accessToken: "secret-access-token",
  tokenType: "bearer",
  userId: "user-1",
  email: "user@example.test",
  name: "Test User",
  tier: "community",
  expiresAt: Date.now() + 60_000,
};

describe("VS Code secure auth session repository", () => {
  let requests: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dbGet.mockReset();
    dbDelete.mockClear();
    requests = vi.fn(async (message: BridgeMessage) => {
      if (message.type === "auth-session-load-request") {
        return { type: "auth-session-load-result", session } as BridgeMessage;
      }
      if (message.type === "auth-session-save-request") {
        return { type: "auth-session-save-result" } as BridgeMessage;
      }
      return { type: "auth-session-clear-result" } as BridgeMessage;
    });
    initAuthSessionStore({
      request: requests,
      send: vi.fn(),
      on: vi.fn(() => () => undefined),
    } as unknown as BridgeClient);
  });

  it("loads the host-owned secure session without reading the webview database", async () => {
    await expect(getAuthSession()).resolves.toEqual(session);
    expect(requests).toHaveBeenCalledWith(expect.objectContaining({ type: "auth-session-load-request" }));
    expect(dbGet).not.toHaveBeenCalled();
  });

  it("migrates an existing plaintext session into host storage and deletes the old row", async () => {
    requests.mockResolvedValueOnce({ type: "auth-session-load-result", session: null });
    dbGet.mockResolvedValue({ key: "auth_session", value: session });

    await expect(getAuthSession()).resolves.toEqual(session);
    expect(requests).toHaveBeenCalledWith(expect.objectContaining({
      type: "auth-session-save-request",
      session,
    }));
    expect(dbDelete).toHaveBeenCalledWith("kv_store", "auth_session");
  });

  it("stores and clears sessions through the extension host, then removes the legacy row", async () => {
    await saveAuthSession(session);
    await clearAuthSession();

    expect(requests).toHaveBeenCalledWith(expect.objectContaining({ type: "auth-session-save-request", session }));
    expect(requests).toHaveBeenCalledWith(expect.objectContaining({ type: "auth-session-clear-request" }));
    expect(dbDelete).toHaveBeenCalledTimes(2);
  });
});
