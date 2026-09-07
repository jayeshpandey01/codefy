import { defineConfig } from "tsup";

// Builds packages/core for the Tauri desktop app's Web Worker (no Node
// runtime, browser-like environment). The "whoami-wasm" condition steers
// the "#ast-grep-adapter" internal subpath import (see package.json#imports)
// to ast-grep-wasm.adapter.ts — see the CLAUDE.md ADR "Why ast-grep Is
// Dual-Built (napi + wasm)".
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist-wasm",
  platform: "browser",
  target: "es2022",
  format: ["esm"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  external: ["@ast-grep/napi", "@ast-grep/wasm", "web-tree-sitter"],
  esbuildOptions(options) {
    options.conditions = ["whoami-wasm"];
  },
});
