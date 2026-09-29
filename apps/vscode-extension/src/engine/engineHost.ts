import * as fs from "node:fs/promises";
import * as path from "node:path";
import type * as vscode from "vscode";
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
  ".env",
  ".sql",
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
  ".idea",
  "build",
  "target",
  // Python virtualenvs / caches -- e.g. site-packages can pull in thousands
  // of vendored files (some multi-MB JSON) that aren't the user's own code.
  "venv",
  "env",
  "__pycache__",
  "site-packages",
  ".tox",
  "tests",
  "test",
  "__tests__",
  "fixtures",
  "demo",
]);

const MAX_SCANNABLE_FILES = 5000;

/**
 * Files above this size are skipped entirely (not read, parsed, or
 * secret-scanned). Legitimate source files are essentially never this large;
 * vendored/generated JSON (e.g. API discovery documents in Python
 * virtualenvs) can be several MB and would otherwise dominate scan time.
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

  constructor(private readonly output: vscode.OutputChannel) {
    this.engine = createAnalysisEngine();
  }

  logDiagnostic(level: "info" | "warn" | "error", message: string): void {
    this.output.appendLine(`[scan] ${level.toUpperCase()} ${message}`);
  }

  /** Findings from the most recent scan, keyed by id -- backs get-trace-request. */
  private lastFindingsById = new Map<string, Finding>();
  private lastFiles: string[] = [];
  private lastFileContents = new Map<string, string>();
  private lastRootPath?: string;

  async scanWorkspace(
    rootPath: string,
    onProgress?: (progress: WorkspaceScanProgress) => void,
  ): Promise<WorkspaceScanResult> {
    const startedAt = Date.now();
    const files = await collectScannableFiles(rootPath);
    this.logDiagnostic("info", `Starting ${rootPath}: ${files.length} file(s) queued.`);
    const findings: Finding[] = [];
    this.lastFindingsById.clear();
    this.lastFiles = files;
    this.lastRootPath = rootPath;
    this.lastFileContents.clear();

    const CONCURRENCY = 6;
    let scanned = 0;
    let currentIndex = 0;
    let failedFiles = 0;
    let oversizedFiles = 0;

    const worker = async () => {
      while (currentIndex < files.length) {
        const idx = currentIndex++;
        const filePath = files[idx];
        if (!filePath) break;

        let stage: "stat" | "read" | "analysis" = "stat";
        try {
          const stat = await fs.stat(filePath);
          if (stat.size > MAX_SCANNABLE_FILE_BYTES) {
            oversizedFiles += 1;
            continue;
          }

          stage = "read";
          const sourceCode = await fs.readFile(filePath, "utf8");
          this.lastFileContents.set(filePath, sourceCode);
          stage = "analysis";
          const result = await this.engine.scanFile(filePath, sourceCode);
          for (const finding of result.findings) {
            findings.push(finding);
            this.lastFindingsById.set(finding.id, finding);
          }
        } catch (error) {
          // Continue scanning other files, but don't hide failures: a scan
          // that silently drops every file looks like a successful empty scan.
          failedFiles += 1;
          this.logDiagnostic(
            "error",
            `${stage} failed for ${filePath}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
          );
        } finally {
          scanned += 1;
          onProgress?.({ scanned, total: files.length });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, files.length) },
      () => worker(),
    );
    await Promise.all(workers);

    this.logDiagnostic(
      failedFiles > 0 ? "warn" : "info",
      `Finished ${rootPath} in ${Math.round((Date.now() - startedAt) / 1000)}s: ${scanned}/${files.length} processed, ${findings.length} finding(s), ${failedFiles} failed file(s), ${oversizedFiles} oversized file(s) skipped.`,
    );

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

    if (this.lastFileContents.size === 0 && files.length > 0) {
      for (const filePath of files) {
        try {
          const stat = await fs.stat(filePath);
          if (stat.size > MAX_SCANNABLE_FILE_BYTES) continue;

          const sourceCode = await fs.readFile(filePath, "utf8");
          this.lastFileContents.set(filePath, sourceCode);
        } catch {
          // ignore unreadable/binary files
        }
      }
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
      if (results.length >= MAX_SCANNABLE_FILES) return;
      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name) || entry.name.startsWith("."))
          continue;
        await walk(path.join(dir, entry.name));
      } else if (
        entry.isFile() &&
        !IGNORED_FILE_NAMES.has(entry.name.toLowerCase()) &&
        !entry.name.toLowerCase().endsWith(".lock") &&
        !entry.name.toLowerCase().endsWith(".min.js") &&
        !entry.name.toLowerCase().endsWith(".min.css") &&
        !entry.name.toLowerCase().endsWith(".map") &&
        !entry.name.toLowerCase().endsWith(".d.ts") &&
        SCANNABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  await walk(rootPath);
  return results;
}
