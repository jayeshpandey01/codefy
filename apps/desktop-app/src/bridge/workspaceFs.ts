import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, type DirEntry } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

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
  ".hpp",
  ".cs",
  ".php",
  ".rb",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".bash",
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
  "coverage",
  "target",
  "src-tauri",
  ".next",
  ".nuxt",
  ".cache",
]);

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
async function walkDir(dirPath: string, out: WorkspaceFile[]): Promise<void> {
  if (out.length >= MAX_FILES) return;

  let entries: DirEntry[];
  try {
    entries = await readDir(dirPath);
  } catch (err) {
    // A single unreadable subdirectory (permissions, a broken symlink, ...)
    // shouldn't abort the whole scan.
    console.warn(`[WhoAmI] Skipping unreadable directory ${dirPath}:`, err);
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;

    if (entry.isDirectory) {
      if (IGNORED_DIR_NAMES.has(entry.name)) continue;
      const childPath = await join(dirPath, entry.name);
      await walkDir(childPath, out);
      continue;
    }

    if (!entry.isFile || !isScannable(entry.name)) continue;

    const filePath = await join(dirPath, entry.name);
    try {
      const content = await readTextFile(filePath);
      out.push({ path: filePath, content });
    } catch (err) {
      // Not valid UTF-8 text, vanished mid-scan, etc. -- skip, don't abort.
      console.warn(`[WhoAmI] Skipping unreadable file ${filePath}:`, err);
    }
  }
}

/**
 * Opens the native folder picker, then recursively reads every scannable
 * file under the chosen folder into memory. Returns `null` if the user
 * cancelled the dialog.
 *
 * `recursive: true` on the dialog's own `open()` call is what grants fs scope
 * to the picked folder's subdirectories at runtime (see
 * src-tauri/capabilities/default.json's comment on the same point) -- without
 * it, `readDir`/`readTextFile` calls on nested folders would be denied even
 * though the top-level folder was explicitly picked by the user.
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

  const files: WorkspaceFile[] = [];
  await walkDir(selected, files);
  return { rootPath: selected, files };
}

/**
 * Scans a given folder path directly without showing the folder picker dialog.
 */
export async function readWorkspaceFromPath(
  dirPath: string,
): Promise<PickedWorkspace> {
  const files: WorkspaceFile[] = [];
  await walkDir(dirPath, files);
  return { rootPath: dirPath, files };
}
