import type { WorkspaceEntry } from "@whoami/types";
import { dbGet, dbGetAll, dbPut, STORES } from "./database.js";

export async function upsertWorkspace(path: string): Promise<void> {
  if (!path || !path.trim()) return;
  const trimmed = path.trim();

  try {
    const existing = await dbGet<WorkspaceEntry>(STORES.WORKSPACES, trimmed);
    const name = trimmed.split(/[/\\]/).filter(Boolean).pop() || trimmed;

    const record: WorkspaceEntry = {
      path: trimmed,
      name: existing?.name || name,
      lastOpenedAt: Date.now(),
      scanCount: (existing?.scanCount || 0) + 1,
    };

    await dbPut(STORES.WORKSPACES, record);
  } catch (err) {
    console.warn(`[WhoAmI DB] Error upserting workspace ${path}:`, err);
  }
}

export async function getRecentWorkspaces(limit = 10): Promise<WorkspaceEntry[]> {
  try {
    const all = await dbGetAll<WorkspaceEntry>(STORES.WORKSPACES);
    return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, limit);
  } catch (err) {
    console.warn("[WhoAmI DB] Error listing workspaces:", err);
    return [];
  }
}

