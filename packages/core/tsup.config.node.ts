import { defineConfig } from "tsup";

// Builds packages/core for the VS Code extension host (real Node.js).
// The "whoami-node" condition steers the "#ast-grep-adapter" internal
// subpath import (see package.json#imports) to ast-grep-napi.adapter.ts —
// see the CLAUDE.md ADR "Why ast-grep Is Dual-Built (napi + wasm)".
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "dist-node",
  platform: "node",
  target: "node20",
  format: ["esm", "cjs"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  external: ["@ast-grep/napi", "@ast-grep/wasm", "web-tree-sitter"],
  esbuildOptions(options) {
    options.conditions = ["whoami-node"];
  },
});
