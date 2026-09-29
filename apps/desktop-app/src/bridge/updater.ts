import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateNotice } from "@whoami/types";

/**
 * The desktop half of the release pipeline's auto-update flow (see
 * docs/RELEASE-PIPELINE.md, Step 5/6). Everything here runs on the main
 * thread, never inside the analysis Worker -- same rule as
 * workspaceFs.ts/engineWorker.js: the Worker never touches Tauri's plugin
 * APIs directly.
 *
 * check()/downloadAndInstall()/relaunch() are the Tauri updater plugin's own
 * JS surface over its Rust implementation: the actual network request,
 * signature verification against the pubkey in tauri.conf.json, and install
 * all happen in Rust. This module only translates that plugin's callbacks
 * into UpdateNotice messages for TauriBridgeClient to emit.
 */

const VERSION_STORAGE_KEY = "whoami.lastSeenVersion";

/** Holds the in-flight Update object between "available" and install() being
 * called from the UI -- mirrors how a single scan's Findings are held in
 * TauriBridgeClient.lastScanFindings until something asks for them. */
let pendingUpdate: Update | null = null;

export async function checkForAppUpdate(
  onNotice: (notice: UpdateNotice) => void,
): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    pendingUpdate = update;
    onNotice({
      kind: "available",
      version: update.version,
      notes: update.body ?? "",
    });
  } catch (err) {
    // A failed check (offline, endpoint unreachable, bad signature) should
    // not alarm the user on every launch -- log it and stay silent, the same
    // choice made for a failed background poll anywhere else in this app.
    console.warn("[WhoAmI] Update check failed:", err);
  }
}

export async function installPendingUpdate(
  onNotice: (notice: UpdateNotice) => void,
): Promise<void> {
  if (!pendingUpdate) {
    onNotice({
      kind: "error",
      message: "No update is pending -- try checking again.",
    });
    return;
  }

  let downloaded = 0;
  let total: number | undefined;

  try {
    await pendingUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength;
          onNotice({ kind: "progress", downloaded: 0, total });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          onNotice({ kind: "progress", downloaded, total });
          break;
        case "Finished":
          onNotice({ kind: "ready", version: pendingUpdate!.version });
          break;
      }
    });
  } catch (err) {
    onNotice({
      kind: "error",
      message: err instanceof Error ? err.message : "Update install failed.",
    });
  }
}

export async function restartApp(): Promise<void> {
  await relaunch();
}

/**
 * Detects "this launch is running a newer build than the last one we saw" --
 * the desktop counterpart to the VS Code extension comparing
 * context.globalState against context.extension.packageJSON.version. Uses
 * localStorage (per-viewer, this webview's own origin) rather than anything
 * shared, since there's only ever one desktop install per machine reading
 * this.
 */
export async function checkForVersionChange(): Promise<UpdateNotice | null> {
  try {
    const current = await getVersion();
    const previous = window.localStorage.getItem(VERSION_STORAGE_KEY);
    window.localStorage.setItem(VERSION_STORAGE_KEY, current);

    if (!previous || previous === current) return null;

    return { kind: "updated", from: previous, to: current, notes: "" };
  } catch (err) {
    console.warn("[WhoAmI] Version-change check failed:", err);
    return null;
  }
}
