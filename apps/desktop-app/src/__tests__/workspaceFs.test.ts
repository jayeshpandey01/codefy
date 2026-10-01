import { beforeEach, describe, expect, it, vi } from "vitest";

const { readDir, readTextFile, size, getSettings } = vi.hoisted(() => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  size: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readDir, readTextFile, size }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => parts.join("/") }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock("../db/preferencesRepo.js", () => ({ getSettings }));

const { readWorkspaceFromPath } = await import("../bridge/workspaceFs.js");

function file(name: string) {
  return { name, isFile: true, isDirectory: false };
}

function directory(name: string) {
  return { name, isFile: false, isDirectory: true };
}

describe("desktop workspace traversal and coverage", () => {
  beforeEach(() => {
    readDir.mockReset();
    readTextFile.mockReset();
    size.mockReset();
    getSettings.mockReset();
    getSettings.mockResolvedValue({ customExcludedDirs: ["fixtures"], maxScannableFiles: 10 });
  });

  it("reports unsupported, oversized, unreadable, and excluded files/directories", async () => {
    readDir.mockImplementation(async (path: string) => {
      if (path === "/workspace") {
        return [file("index.ts"), file("README.md"), file("large.py"), file("broken.js"), directory("src"), directory(".git"), directory("fixtures"), directory("unreadable")];
      }
      if (path === "/workspace/src") return [file("handler.py")];
      if (path === "/workspace/unreadable") throw new Error("permission denied");
      return [];
    });
    size.mockImplementation(async (path: string) => path.endsWith("large.py") ? 1_000_001 : 10);
    readTextFile.mockImplementation(async (path: string) => {
      if (path.endsWith("broken.js")) throw new Error("invalid text");
      return "source";
    });

    const result = await readWorkspaceFromPath("/workspace");

    expect(result.files.map((item) => item.path)).toEqual([
      "/workspace/index.ts",
      "/workspace/src/handler.py",
    ]);
    expect(result.coverage).toEqual({
      filesDiscovered: 5,
      filesScanned: 0,
      filesFailed: 1,
      filesSkippedLarge: 1,
      filesSkippedUnsupported: 1,
      directoriesSkipped: 2,
      directoriesUnreadable: 1,
      fileLimitReached: false,
    });
  });

  it("marks a scan truncated when the configured file cap leaves entries unvisited", async () => {
    getSettings.mockResolvedValue({ customExcludedDirs: [], maxScannableFiles: 1 });
    readDir.mockResolvedValue([file("first.ts"), file("second.ts")]);
    size.mockResolvedValue(10);
    readTextFile.mockResolvedValue("source");

    const result = await readWorkspaceFromPath("/workspace");
    expect(result.files).toHaveLength(1);
    expect(result.coverage.fileLimitReached).toBe(true);
  });
});
