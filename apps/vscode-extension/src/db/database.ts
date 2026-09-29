/**
 * Extension-host-backed persistence engine for the VS Code build --
 * the counterpart to apps/desktop-app/src/db/database.ts (IndexedDB).
 *
 * The webview has no ambient `indexedDB`-equivalent that survives reliably
 * across VS Code sessions (per VS Code's own guidance, a webview's storage
 * partition isn't guaranteed to persist the way `ExtensionContext.globalState`
 * is), so this instead holds one in-memory blob, hydrated once from
 * `context.globalState` via a `persistence-load-request` BridgeMessage, and
 * flushed back via `persistence-save-request` after every write. See
 * ExtensionBridge's PERSISTENCE_KEY constant for the extension-host side.
 *
 * Exposes the exact same `dbGet`/`dbPut`/`dbDelete`/`dbGetAll`/
 * `dbGetAllFromIndex`/`dbClear`/`STORES` primitives as the desktop app's
 * database.ts, so `*Repo.ts` files here can mirror the desktop ones almost
 * line-for-line -- only this one module differs per platform.
 */
import type { BridgeClient } from "@whoami/ui";
import type { BridgeMessage } from "@whoami/types";

export const STORES = {
  KV_STORE: "kv_store",
  WORKSPACES: "workspaces",
  SCAN_SESSIONS: "scan_sessions",
  FINDINGS: "findings",
  CHAT_HISTORY: "chat_history",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

type PersistedBlob = Record<StoreName, Record<string, unknown>>;

function emptyBlob(): PersistedBlob {
  return {
    kv_store: {},
    workspaces: {},
    scan_sessions: {},
    findings: {},
    chat_history: {},
  };
}

/** Derives the record's own key the same way each IndexedDB store's
 * `keyPath` does on the desktop side -- see database.ts's STORES comment
 * there for which field is the key per store. */
function recordKey(value: unknown): string {
  const v = value as Record<string, unknown>;
  const key = v["id"] ?? v["key"] ?? v["path"] ?? v["workspacePath"];
  if (typeof key !== "string") {
    throw new Error(
      "[WhoAmI DB] Could not derive a string key (id/key/path/workspacePath) from the record being stored",
    );
  }
  return key;
}

let bridgeClient: BridgeClient | null = null;
let cache: PersistedBlob | null = null;
let loadPromise: Promise<PersistedBlob> | null = null;
let requestCounter = 0;
let flushScheduled = false;

/**
 * Must be called once at module load (see webview/main.tsx, right after
 * constructing the module-level `bridge`) before any `*Repo.ts` function is
 * used. Idempotent -- safe to call again with the same client.
 */
export function initPersistence(client: BridgeClient): void {
  bridgeClient = client;
}

function nextRequestId(): string {
  requestCounter += 1;
  return `persist-${requestCounter}-${Date.now()}`;
}

async function loadBlob(): Promise<PersistedBlob> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  if (!bridgeClient) {
    throw new Error(
      "[WhoAmI DB] initPersistence() must be called before the db layer is used",
    );
  }

  const client = bridgeClient;
  loadPromise = client
    .request<
      Extract<BridgeMessage, { type: "persistence-load-request" }>,
      Extract<BridgeMessage, { type: "persistence-load-result" }>
    >({ type: "persistence-load-request", requestId: nextRequestId() })
    .then((res) => {
      const loaded = (res.data as Partial<PersistedBlob> | null) ?? {};
      cache = { ...emptyBlob(), ...loaded };
      return cache;
    })
    .catch((err: unknown) => {
      console.warn(
        "[WhoAmI DB] Failed to load persisted state, starting empty:",
        err,
      );
      cache = emptyBlob();
      return cache;
    });
  return loadPromise;
}

/** Debounced via a macrotask so a burst of synchronous-ish writes (e.g.
 * saveScanSession's per-finding dbPut loop) coalesce into one
 * persistence-save-request instead of one per write. */
function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    if (bridgeClient && cache) {
      bridgeClient.send({ type: "persistence-save-request", data: cache });
    }
  }, 0);
}

export async function dbGet<T>(
  storeName: StoreName,
  key: string,
): Promise<T | null> {
  const blob = await loadBlob();
  return (blob[storeName][key] as T | undefined) ?? null;
}

export async function dbPut<T>(storeName: StoreName, value: T): Promise<void> {
  const blob = await loadBlob();
  blob[storeName][recordKey(value)] = value;
  scheduleFlush();
}

export async function dbDelete(storeName: StoreName, key: string): Promise<void> {
  const blob = await loadBlob();
  delete blob[storeName][key];
  scheduleFlush();
}

export async function dbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const blob = await loadBlob();
  return Object.values(blob[storeName]) as T[];
}

export async function dbGetAllFromIndex<T>(
  storeName: StoreName,
  indexName: string,
  query?: string,
): Promise<T[]> {
  const all = await dbGetAll<Record<string, unknown>>(storeName);
  if (query === undefined) return all as T[];
  return all.filter((row) => row[indexName] === query) as T[];
}

export async function dbClear(storeName: StoreName): Promise<void> {
  const blob = await loadBlob();
  blob[storeName] = {};
  scheduleFlush();
}
