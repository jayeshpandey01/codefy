import type { Finding, ScanSessionEntry, ScanSessionWithFindings } from "@whoami/types";
import {
  dbClear,
  dbDelete,
  dbGet,
  dbGetAll,
  dbGetAllFromIndex,
  dbPut,
  STORES,
} from "./database.js";

interface StoredFinding {
  id: string;
  sessionId: string;
  finding: Finding;
}

export async function saveScanSession(
  session: ScanSessionEntry,
  findings: readonly Finding[],
): Promise<void> {
  try {
    await dbPut(STORES.SCAN_SESSIONS, {
      ...session,
      findingsCount: findings.length,
    });

    for (const f of findings) {
      const record: StoredFinding = {
        id: `${session.id}_${f.id}`,
        sessionId: session.id,
        finding: f,
      };
      await dbPut(STORES.FINDINGS, record);
    }
  } catch (err) {
    console.warn("[WhoAmI DB] Error saving scan session:", err);
  }
}

export async function listScanSessions(limit = 100): Promise<ScanSessionEntry[]> {
  try {
    const sessions = await dbGetAll<ScanSessionEntry>(STORES.SCAN_SESSIONS);
    // Sort descending by startedAt
    return sessions
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  } catch (err) {
    console.warn("[WhoAmI DB] Error listing scan sessions:", err);
    return [];
  }
}

export async function getScanSessionWithFindings(
  sessionId: string,
): Promise<ScanSessionWithFindings | null> {
  try {
    const session = await dbGet<ScanSessionEntry>(STORES.SCAN_SESSIONS, sessionId);
    if (!session) return null;

    const stored = await dbGetAllFromIndex<StoredFinding>(
      STORES.FINDINGS,
      "sessionId",
      sessionId,
    );

    const findings = stored.map((s) => s.finding);

    return {
      ...session,
      findings,
    };
  } catch (err) {
    console.warn(`[WhoAmI DB] Error loading session ${sessionId}:`, err);
    return null;
  }
}

export async function deleteScanSession(sessionId: string): Promise<void> {
  try {
    await dbDelete(STORES.SCAN_SESSIONS, sessionId);

    const stored = await dbGetAllFromIndex<StoredFinding>(
      STORES.FINDINGS,
      "sessionId",
      sessionId,
    );
    for (const record of stored) {
      await dbDelete(STORES.FINDINGS, record.id);
    }
  } catch (err) {
    console.warn(`[WhoAmI DB] Error deleting session ${sessionId}:`, err);
  }
}

export async function clearAllScanHistory(): Promise<void> {
  try {
    await dbClear(STORES.SCAN_SESSIONS);
    await dbClear(STORES.FINDINGS);
  } catch (err) {
    console.warn("[WhoAmI DB] Error clearing scan history:", err);
  }
}

