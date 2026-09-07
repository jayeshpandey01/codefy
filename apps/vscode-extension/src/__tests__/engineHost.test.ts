import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { collectScannableFiles } from "../engine/engineHost.js";

describe("collectScannableFiles", () => {
  it("finds scannable source files and skips ignored directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "whoami-scan-"));
    try {
      await writeFile(path.join(dir, "index.ts"), "");
      await writeFile(path.join(dir, "README.md"), "");

      await mkdir(path.join(dir, "node_modules"));
      await writeFile(path.join(dir, "node_modules", "skip.ts"), "");

      await mkdir(path.join(dir, "nested"));
      await writeFile(path.join(dir, "nested", "app.tsx"), "");

      const files = await collectScannableFiles(dir);

      expect(files).toContain(path.join(dir, "index.ts"));
      expect(files).toContain(path.join(dir, "nested", "app.tsx"));
      expect(files.some((file) => file.includes("node_modules"))).toBe(false);
      expect(files.some((file) => file.endsWith("README.md"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
