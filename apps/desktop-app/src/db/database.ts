/**
 * In-process transactional database engine for WhoAmI desktop app.
 * Persists to `~/.codefy/<store>.json` via Tauri's fs plugin, with an
 * in-memory Map per store for zero-latency reads -- see
 * docs/LOCAL-PERSISTENCE-SPEC.md.
 */
import { homeDir } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";

export const STORES = {
  KV_STORE: "kv_store",
  WORKSPACES: "workspaces",
  SCAN_SESSIONS: "scan_sessions",
  FINDINGS: "findings",
  CHAT_HISTORY: "chat_history",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

// In-memory cache for zero-latency UI reads
const cache: Record<string, Map<string | number, unknown>> = {
  kv_store: new Map(),
  workspaces: new Map(),
  scan_sessions: new Map(),
  findings: new Map(),
  chat_history: new Map(),
};
let initPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getKeyPath(storeName: StoreName): string {
  switch (storeName) {
    case STORES.KV_STORE: return "key";
    case STORES.WORKSPACES: return "path";
    case STORES.SCAN_SESSIONS: return "id";
    case STORES.FINDINGS: return "id";
    case STORES.CHAT_HISTORY: return "workspacePath";
    default: return "id";
  }
}

async function getFilePath(storeName: StoreName): Promise<string> {
  const home = await homeDir();
  return `${home}.codefy/${storeName}.json`;
}

async function initDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const home = await homeDir();
      const dirPath = `${home}.codefy`;
      const dirExists = await exists(dirPath);
      if (!dirExists) {
        await mkdir(dirPath, { recursive: true });
      }

      for (const storeName of Object.values(STORES)) {
        const filePath = await getFilePath(storeName as StoreName);
        const fileExists = await exists(filePath);
        if (fileExists) {
          try {
            const text = await readTextFile(filePath);
            const data: unknown = JSON.parse(text);
            const keyPath = getKeyPath(storeName as StoreName);

            if (Array.isArray(data)) {
              for (const item of data as unknown[]) {
                if (!isRecord(item)) continue;
                const key = item[keyPath];
                if (typeof key === "string" || typeof key === "number") {
                  cache[storeName]!.set(key, item);
                }
              }
            } else if (isRecord(data)) {
              for (const [k, v] of Object.entries(data)) {
                cache[storeName]!.set(k, v);
              }
            }
          } catch (e) {
            console.warn(`[WhoAmI DB] Failed to parse ${storeName}.json`, e);
          }
        }
      }
    } catch (err) {
      console.error("[WhoAmI DB] Failed to initialize file system DB:", err);
    }
  })();

  return initPromise;
}

export function getDatabase(): Promise<void> {
  return initDb();
}

async function flushStore(storeName: StoreName): Promise<void> {
  try {
    const filePath = await getFilePath(storeName);
    const data = Array.from(cache[storeName]!.values());
    await writeTextFile(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[WhoAmI DB] Failed to flush ${storeName}.json`, err);
  }
}

export async function dbGet<T>(storeName: StoreName, key: string | number): Promise<T | null> {
  await getDatabase();
  return (cache[storeName]!.get(key) as T) ?? null;
}

export async function dbPut<T>(storeName: StoreName, value: T): Promise<void> {
  await getDatabase();
  const keyPath = getKeyPath(storeName);
  const key = isRecord(value) ? value[keyPath] : undefined;
  if (typeof key !== "string" && typeof key !== "number") {
    throw new Error(`Missing key ${keyPath} on object for store ${storeName}`);
  }

  cache[storeName]!.set(key, value);
  await flushStore(storeName);
}

export async function dbDelete(storeName: StoreName, key: string | number): Promise<void> {
  await getDatabase();
  if (cache[storeName]!.has(key)) {
    cache[storeName]!.delete(key);
    await flushStore(storeName);
  }
}

export async function dbGetAll<T>(storeName: StoreName): Promise<T[]> {
  await getDatabase();
  return Array.from(cache[storeName]!.values()) as T[];
}

export async function dbGetAllFromIndex<T>(
  storeName: StoreName,
  indexName: string,
  query?: string | number,
): Promise<T[]> {
  await getDatabase();
  const all = Array.from(cache[storeName]!.values()) as T[];
  if (query === undefined) return all;

  return all.filter((item) => isRecord(item) && item[indexName] === query);
}

export async function dbClear(storeName: StoreName): Promise<void> {
  await getDatabase();
  cache[storeName]!.clear();
  await flushStore(storeName);
}
