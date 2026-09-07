import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  buildWorkspaceGraph,
  createAnalysisEngine,
  type AnalysisEngine,
} from "@whoami/core/node";
import type { Finding, WorkspaceGraph } from "@whoami/types";

/** File extensions supported for security rules and multi-language syntax checking. */
const SCANNABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
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
]);

/** Directories never worth walking into -- build output, VCS metadata, deps. */
const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-node",
  "dist-wasm",
  "out",
  "coverage",
  ".turbo",
  "dist-vsix",
  "src-tauri",
  ".vscode-test",
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

export interface WorkspaceScanProgress {
  readonly scanned: number;
  readonly total: number;
}

export interface WorkspaceScanResult {
  readonly findings: readonly Finding[];
}

/**
 * Owns one @whoami/core/node AnalysisEngine instance for the lifetime of the
 * extension host. extension.ts constructs exactly one of these in
 * activate() and hands it to both commands and the bridge -- see
 * apps/vscode-extension's build report / CLAUDE.md Part 5.
 */
export class EngineHost {
  private readonly engine: AnalysisEngine;

  /** Findings from the most recent scan, keyed by id -- backs get-trace-request. */
  private lastFindingsById = new Map<string, Finding>();
  private lastFiles: string[] = [];
  private lastFileContents = new Map<string, string>();
  private lastRootPath?: string;

  constructor() {
    this.engine = createAnalysisEngine();
  }

  async scanWorkspace(
    rootPath: string,
    onProgress?: (progress: WorkspaceScanProgress) => void,
  ): Promise<WorkspaceScanResult> {
    const files = await collectScannableFiles(rootPath);
    const findings: Finding[] = [];
    this.lastFindingsById.clear();
    this.lastFiles = files;
    this.lastRootPath = rootPath;
    this.lastFileContents.clear();

    let scanned = 0;
    for (const filePath of files) {
      try {
        const sourceCode = await fs.readFile(filePath, "utf8");
        this.lastFileContents.set(filePath, sourceCode);
        const result = await this.engine.scanFile(filePath, sourceCode);
        for (const finding of result.findings) {
          findings.push(finding);
          this.lastFindingsById.set(finding.id, finding);
        }
      } catch {
        // Unreadable/binary/permission-denied file -- skip it rather than
        // aborting the whole workspace scan over one bad file.
      }
      scanned += 1;
      onProgress?.({ scanned, total: files.length });
    }

    return { findings };
  }

  getFinding(findingId: string): Finding | undefined {
    return this.lastFindingsById.get(findingId);
  }

  async getWorkspaceGraph(rootPath?: string): Promise<WorkspaceGraph> {
    const root = rootPath ?? this.lastRootPath ?? "";
    let files = this.lastFiles;
    if (files.length === 0 && root) {
      files = await collectScannableFiles(root);
      this.lastFiles = files;
    }

    return buildWorkspaceGraph(
      files,
      Array.from(this.lastFindingsById.values()),
      this.lastFileContents,
      root,
    );
  }
}

/** Exported for the smoke test in src/__tests__/engineHost.test.ts. */
export async function collectScannableFiles(
  rootPath: string,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith("."))
          continue;
        await walk(path.join(dir, entry.name));
      } else if (
        entry.isFile() &&
        !IGNORED_FILE_NAMES.has(entry.name.toLowerCase()) &&
        !entry.name.toLowerCase().endsWith(".lock") &&
        !entry.name.endsWith(".min.js") &&
        !entry.name.endsWith(".min.css") &&
        !entry.name.endsWith(".map") &&
        !entry.name.endsWith(".d.ts") &&
        SCANNABLE_EXTENSIONS.has(path.extname(entry.name))
      ) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  await walk(rootPath);
  return results;
}
