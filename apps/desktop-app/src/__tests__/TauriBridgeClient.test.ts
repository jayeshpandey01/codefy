import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "@whoami/types";

const tauriFetch = vi.fn();
const settings = {
  orchestratorUrl: "",
  operatorApiKey: "op-key",
  adminApiKey: "",
};

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => tauriFetch(...args) }));
vi.mock("../db/preferencesRepo.js", () => ({ getSettings: async () => settings }));
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
    settings.orchestratorUrl = "";
  });

  it("sends orchestrator requests through the http plugin's fetch with the operator key", async () => {
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
    expect((init as RequestInit).headers).toMatchObject({ "X-API-Key": "op-key" });
  });

  it("uses a valid URL from Settings", async () => {
    settings.orchestratorUrl = "http://localhost:8000";
    tauriFetch.mockResolvedValue(jsonResponse([]));
    const bridge = new TauriBridgeClient();

    await bridge.request({ type: "list-scans-request" } as BridgeMessage);

    expect(String(tauriFetch.mock.calls[0]![0])).toMatch(/^http:\/\/localhost:8000\//);
  });

  it("sends the admin key for admin endpoints such as register-target", async () => {
    settings.adminApiKey = "admin-key";
    tauriFetch.mockResolvedValue(jsonResponse({ id: "t-1" }));
    const bridge = new TauriBridgeClient();

    await bridge.request({
      type: "register-target-request",
      target: { value: "example.com" },
    } as unknown as BridgeMessage);

    expect((tauriFetch.mock.calls[0]![1] as RequestInit).headers).toMatchObject({
      "X-API-Key": "admin-key",
    });
    settings.adminApiKey = "";
  });

  it("rejects a disallowed Settings URL without sending anything", async () => {
    settings.orchestratorUrl = "https://evil.example.com";
    const bridge = new TauriBridgeClient();

    await expect(
      bridge.request({ type: "list-targets-request" } as BridgeMessage),
    ).rejects.toThrow(/not an allowed orchestrator host/);
    expect(tauriFetch).not.toHaveBeenCalled();
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
