import { defineConfig } from "tsup";

// Builds the chat query engine as its own small, dependency-free bundle —
// safe to import from a browser-context UI thread (VS Code webview, Tauri
// desktop main thread) without pulling in ast-grep/web-tree-sitter. See
// src/query/index.ts's module doc and docs/CHAT-QUERY-ENGINE-SPEC.md §B.4.
export default defineConfig({
  entry: ["src/query/index.ts"],
  outDir: "dist-query",
  platform: "neutral",
  target: "es2022",
  format: ["esm", "cjs"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
});
