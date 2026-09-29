import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, size, type DirEntry } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getSettings } from "../db/preferencesRepo.js";
import { invoke } from "@tauri-apps/api/core";

/**
 * In-memory file the Worker can analyze -- exactly the shape
 * src/worker/engine.worker.ts expects. Deliberately just {path, content}: the
 * Worker never touches Tauri's fs/IPC bridge itself (see the module doc on
 * TauriBridgeClient.ts), so this is the whole handoff.
 */
export interface WorkspaceFile {
  readonly path: string;
  readonly content: string;
}

/** Only these extensions are ever handed to the engine */
const SCANNABLE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".pyw",
  ".json",
  ".html",
  ".htm",
  ".css",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".cs",
  ".php",
  ".rb",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".bash",
  ".kt",
  ".kts",
  ".swift",
  ".vue",
  ".dart",
  ".lua",
  ".sol",
  ".env",
  ".sql",
];

/** Mirrors the root .gitignore's own noise list -- skipping these avoids scanning generated/vendored code no one asked about. */
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".vscode",
  ".idea",
  "dist",
  "dist-node",
  "dist-wasm",
  "build",
  "out",
  "dist-vsix",
  ".vscode-test",
  "coverage",
  "target",
  "src-tauri",
  ".next",
  ".nuxt",
  ".cache",
  // Python virtualenvs / caches -- e.g. site-packages can pull in thousands
  // of vendored files (some multi-MB JSON) that aren't the user's own code.
  "venv",
  "env",
  "__pycache__",
  "site-packages",
  ".tox",
]);

/**
 * Files above this size are skipped entirely (not read into memory or
 * handed to the engine). Legitimate source files are essentially never
 * this large; vendored/generated JSON (e.g. API discovery documents in
 * Python virtualenvs) can be several MB and would otherwise dominate scan
 * time and memory -- mirrors apps/vscode-extension's engineHost.ts cap.
 */
const MAX_SCANNABLE_FILE_BYTES = 1_000_000;

const IGNORED_FILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "composer.lock",
  "cargo.lock",
  "gemfile.lock",
]);

/** Hard safety cap so picking an enormous folder (e.g. a whole drive) can't hang the Worker indefinitely. */
const MAX_FILES = 5000;

function scanLog(level: "info" | "warn" | "error", message: string): void {
  void invoke("log_scan_diagnostic", { level, message }).catch((err: unknown) => {
    console.warn("[WhoAmI] Could not forward scan diagnostics to terminal:", err);
  });
}

function isScannable(name: string): boolean {
  const lower = name.toLowerCase();
  if (IGNORED_FILE_NAMES.has(lower)) return false;
  if (lower.endsWith(".lock")) return false;
  if (
    lower.endsWith(".min.js") ||
    lower.endsWith(".min.css") ||
    lower.endsWith(".map") ||
    lower.endsWith(".d.ts")
  ) {
    return false;
  }
  return SCANNABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Recursively walks `dirPath`, reading every scannable text file into memory.
 * plugin-fs's readDir is deliberately NOT recursive (see its own JSDoc
 * example, which shows exactly this manual-recursion pattern) -- there is no
 * `{ recursive: true }` read option to lean on here.
 */
async function walkDir(
  dirPath: string,
  out: WorkspaceFile[],
  config?: {
    customExcludedDirs?: readonly string[];
    maxFiles?: number;
    stats?: { directories: number; skippedLarge: number; failedFiles: number };
    startedAt?: number;
    lastLogAt?: number;
  },
): Promise<void> {
  const maxFiles = config?.maxFiles ?? MAX_FILES;
  if (out.length >= maxFiles) return;

  const customSet = config?.customExcludedDirs
    ? new Set(config.customExcludedDirs.map((d) => d.toLowerCase().trim()))
    : null;

  let entries: DirEntry[];
  try {
    entries = await readDir(dirPath);
    if (config?.stats) config.stats.directories += 1;
    if (config?.startedAt !== undefined && config?.stats) {
      const now = Date.now();
      if (config.stats.directories === 1 || now - (config.lastLogAt ?? 0) >= 10_000) {
        scanLog("info", `Walking workspace: directories=${config.stats.directories}, files=${out.length}, current=${dirPath}, elapsed=${Math.round((now - config.startedAt) / 1000)}s.`);
        config.lastLogAt = now;
      }
    }
  } catch (err) {
    // A single unreadable subdirectory (permissions, a broken symlink, ...)
    // shouldn't abort the whole scan.
    console.warn(`[WhoAmI] Skipping unreadable directory ${dirPath}:`, err);
    if (config?.stats) config.stats.directories += 1;
    scanLog("warn", `Unable to read directory ${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  for (const entry of entries) {
    if (out.length >= maxFiles) return;

    if (entry.isDirectory) {
      const lowerName = entry.name.toLowerCase();
      // Match the VS Code extension's traversal behavior: hidden directories
      // (for example .venv and .github) are not source trees to scan. Skipping
      // them also avoids noisy Tauri scope warnings for inaccessible folders.
      if (
        entry.name.startsWith(".") ||
        IGNORED_DIR_NAMES.has(lowerName) ||
        (customSet && customSet.has(lowerName))
      ) {
        continue;
      }
      const childPath = await join(dirPath, entry.name);
      await walkDir(childPath, out, config);
      continue;
    }

    if (!entry.isFile || !isScannable(entry.name)) continue;

    const filePath = await join(dirPath, entry.name);
    try {
      const fileSize = await size(filePath);
      if (fileSize > MAX_SCANNABLE_FILE_BYTES) {
        if (config?.stats) config.stats.skippedLarge += 1;
        continue;
      }

      const content = await readTextFile(filePath);
      out.push({ path: filePath, content });
      if (config?.startedAt !== undefined && config?.stats) {
        const now = Date.now();
        if (out.length === 1 || out.length % 100 === 0 || now - (config.lastLogAt ?? 0) >= 10_000) {
          scanLog("info", `Reading workspace: files=${out.length}, directories=${config.stats.directories}, large files skipped=${config.stats.skippedLarge}, elapsed=${Math.round((now - config.startedAt) / 1000)}s.`);
          config.lastLogAt = now;
        }
      }
    } catch (err) {
      // Not valid UTF-8 text, vanished mid-scan, etc. -- skip, don't abort.
      console.warn(`[WhoAmI] Skipping unreadable file ${filePath}:`, err);
      if (config?.stats) config.stats.failedFiles += 1;
      if (!config?.stats || config.stats.failedFiles <= 5 || config.stats.failedFiles % 100 === 0) {
        scanLog("warn", `Unable to read file ${filePath}: ${err instanceof Error ? err.message : String(err)} (failed reads=${config?.stats?.failedFiles ?? 1}).`);
      }
    }
  }
}

/**
 * Opens the native folder picker, then recursively reads every scannable
 * file under the chosen folder into memory. Returns `null` if the user
 * cancelled the dialog.
 *
 * `recursive: true` on the dialog's own `open()` call only affects the
 * dialog itself (letting the user navigate into subfolders) -- it does NOT
 * grant fs plugin scope. Actual read access to arbitrary user folders comes
 * from the static `fs:scope` entry (`$HOME`, `$HOME/**`) in
 * src-tauri/capabilities/default.json; without it, both this picker flow
 * and readWorkspaceFromPath() below would have every readDir/readTextFile
 * call outside the app's own sandboxed directories denied, which surfaces
 * as "no scannable files" rather than a permission error (see walkDir's
 * catch block, which treats a denied readDir like any other unreadable
 * directory).
 */
export interface PickedWorkspace {
  readonly rootPath: string;
  readonly files: WorkspaceFile[];
}

/**
 * Opens the native folder picker dialog and returns the selected directory path,
 * or `null` if cancelled.
 */
export async function pickWorkspaceFolder(
  defaultPath?: string,
): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    recursive: true,
    title: "Select a workspace folder to scan",
    defaultPath: defaultPath && defaultPath.trim() ? defaultPath.trim() : undefined,
  });

  return selected ?? null;
}

export async function pickAndReadWorkspace(): Promise<PickedWorkspace | null> {
  const selected = await pickWorkspaceFolder();
  if (!selected) return null; // user cancelled

  const settings = await getSettings();
  const files: WorkspaceFile[] = [];
  const stats = { directories: 0, skippedLarge: 0, failedFiles: 0 };
  const startedAt = Date.now();
  scanLog("info", `Starting workspace traversal at ${selected} (max files=${settings.maxScannableFiles}).`);
  await walkDir(selected, files, {
    customExcludedDirs: settings.customExcludedDirs,
    maxFiles: settings.maxScannableFiles,
    stats,
    startedAt,
    lastLogAt: startedAt,
  });
  scanLog("info", `Workspace traversal finished in ${Math.round((Date.now() - startedAt) / 1000)}s: files=${files.length}, directories=${stats.directories}, large files skipped=${stats.skippedLarge}, failed reads=${stats.failedFiles}${files.length >= settings.maxScannableFiles ? ", file cap reached" : ""}.`);
  return { rootPath: selected, files };
}

/**
 * Scans a given folder path directly without showing the folder picker dialog.
 */
export async function readWorkspaceFromPath(
  dirPath: string,
): Promise<PickedWorkspace> {
  const settings = await getSettings();
  const files: WorkspaceFile[] = [];
  const stats = { directories: 0, skippedLarge: 0, failedFiles: 0 };
  const startedAt = Date.now();
  scanLog("info", `Starting workspace traversal at ${dirPath} (max files=${settings.maxScannableFiles}).`);
  await walkDir(dirPath, files, {
    customExcludedDirs: settings.customExcludedDirs,
    maxFiles: settings.maxScannableFiles,
    stats,
    startedAt,
    lastLogAt: startedAt,
  });
  scanLog("info", `Workspace traversal finished in ${Math.round((Date.now() - startedAt) / 1000)}s: files=${files.length}, directories=${stats.directories}, large files skipped=${stats.skippedLarge}, failed reads=${stats.failedFiles}${files.length >= settings.maxScannableFiles ? ", file cap reached" : ""}.`);
  return { rootPath: dirPath, files };
}
