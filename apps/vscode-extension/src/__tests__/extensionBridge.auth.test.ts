import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import type { AuthSession, BridgeMessage } from "@whoami/types";

vi.mock("vscode", () => ({
  workspace: {
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    workspaceFolders: [],
  },
}));

const { ExtensionBridge } = await import("../bridge/extensionBridge.js");

const session: AuthSession = {
  accessToken: "host-only-token",
  tokenType: "bearer",
  userId: "user-secure-1",
  email: "secure@example.test",
  name: "Secure User",
  tier: "community",
  expiresAt: Date.now() + 60_000,
};

describe("ExtensionBridge secure session storage", () => {
  it("stores and retrieves the session through VS Code SecretStorage", async () => {
    const secrets = new Map<string, string>();
    const secretApi = {
      get: vi.fn(async (key: string) => secrets.get(key)),
      store: vi.fn(async (key: string, value: string) => { secrets.set(key, value); }),
      delete: vi.fn(async (key: string) => { secrets.delete(key); }),
    };
    const posted: BridgeMessage[] = [];
    let receive: ((message: BridgeMessage) => void) | undefined;
    const panel = {
      webview: {
        onDidReceiveMessage: (listener: (message: BridgeMessage) => void) => {
          receive = listener;
          return { dispose: vi.fn() };
        },
        postMessage: async (message: BridgeMessage) => { posted.push(message); return true; },
      },
    };
    const context = { secrets: secretApi };
    const bridge = new ExtensionBridge(
      panel as unknown as vscode.WebviewPanel,
      {} as never,
      context as unknown as vscode.ExtensionContext,
    );
    const send = async (message: BridgeMessage) => {
      receive?.(message);
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    await send({ type: "auth-session-save-request", session, requestId: "save-1" });
    expect(secretApi.store).toHaveBeenCalledWith("whoami.auth.session.v1", JSON.stringify(session));
    expect(posted).toContainEqual({ type: "auth-session-save-result", requestId: "save-1" });

    await send({ type: "auth-session-load-request", requestId: "load-1" });
    expect(posted).toContainEqual({ type: "auth-session-load-result", session, requestId: "load-1" });

    await send({ type: "auth-session-clear-request", requestId: "clear-1" });
    expect(secretApi.delete).toHaveBeenCalledWith("whoami.auth.session.v1");
    expect(secrets.size).toBe(0);
    bridge.dispose();
  });

  it("automatically removes an expired session and returns null", async () => {
    const expiredSession: AuthSession = {
      accessToken: "expired-token",
      tokenType: "bearer",
      userId: "user-exp-1",
      email: "expired@example.test",
      name: "Expired User",
      tier: "community",
      expiresAt: Date.now() - 10_000,
    };
    const secrets = new Map<string, string>([
      ["whoami.auth.session.v1", JSON.stringify(expiredSession)],
    ]);
    const secretApi = {
      get: vi.fn(async (key: string) => secrets.get(key)),
      store: vi.fn(async (key: string, value: string) => { secrets.set(key, value); }),
      delete: vi.fn(async (key: string) => { secrets.delete(key); }),
    };
    const posted: BridgeMessage[] = [];
    let receive: ((message: BridgeMessage) => void) | undefined;
    const panel = {
      webview: {
        onDidReceiveMessage: (listener: (message: BridgeMessage) => void) => {
          receive = listener;
          return { dispose: vi.fn() };
        },
        postMessage: async (message: BridgeMessage) => { posted.push(message); return true; },
      },
    };
    const context = { secrets: secretApi };
    const bridge = new ExtensionBridge(
      panel as unknown as vscode.WebviewPanel,
      {} as never,
      context as unknown as vscode.ExtensionContext,
    );
    const send = async (message: BridgeMessage) => {
      receive?.(message);
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    await send({ type: "auth-session-load-request", requestId: "load-expired" });
    expect(secretApi.delete).toHaveBeenCalledWith("whoami.auth.session.v1");
    expect(posted).toContainEqual({
      type: "auth-session-load-result",
      session: null,
      requestId: "load-expired",
    });
    bridge.dispose();
  });
});
