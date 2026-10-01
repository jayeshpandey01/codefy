import type { BridgeClient } from "@whoami/ui";
import type { AuthSession, BridgeMessage } from "@whoami/types";
import { dbDelete, dbGet, STORES } from "./database.js";

const AUTH_SESSION_KEY = "auth_session";

let bridgeClient: BridgeClient | null = null;
let requestCounter = 0;

/** The extension host owns the token in VS Code SecretStorage. */
export function initAuthSessionStore(client: BridgeClient): void {
  bridgeClient = client;
}

function client(): BridgeClient {
  if (!bridgeClient) throw new Error("Auth session bridge is not initialized.");
  return bridgeClient;
}

function requestId(): string {
  requestCounter += 1;
  return `auth-session-${requestCounter}-${Date.now()}`;
}

async function request<T extends BridgeMessage>(message: BridgeMessage): Promise<T> {
  return client().request<BridgeMessage, T>({ ...message, requestId: requestId() });
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const stored = await request<Extract<BridgeMessage, { type: "auth-session-load-result" }>>({
    type: "auth-session-load-request",
  });
  if (stored.session) return stored.session;

  // One-time migration from the old webview persistence store. It stored the
  // bearer token in ~/.codefy/kv_store.json; move it into SecretStorage and
  // remove the legacy plaintext row.
  const legacy = await dbGet<{ key: string; value: AuthSession }>(STORES.KV_STORE, AUTH_SESSION_KEY);
  if (!legacy?.value?.accessToken) return null;
  await saveAuthSession(legacy.value);
  return legacy.value;
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await request<Extract<BridgeMessage, { type: "auth-session-save-result" }>>({
    type: "auth-session-save-request",
    session,
  });
  await dbDelete(STORES.KV_STORE, AUTH_SESSION_KEY);
}

export async function clearAuthSession(): Promise<void> {
  await request<Extract<BridgeMessage, { type: "auth-session-clear-result" }>>({
    type: "auth-session-clear-request",
  });
  await dbDelete(STORES.KV_STORE, AUTH_SESSION_KEY);
}
