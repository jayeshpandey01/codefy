import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { viteStaticCopy } from "vite-plugin-static-copy";

// pnpm's workspace layout means tree-sitter-wasms/web-tree-sitter only exist
// under this app's own node_modules because they're declared as direct
// dependencies here (see package.json) -- not just pulled in transitively via
// @whoami/core. require.resolve (via createRequire, since this config file
// itself runs as plain Node under Vite, not through the app's own bundler)
// finds the real on-disk package root regardless of pnpm's symlink-into-.pnpm
// layout, which is more robust than hardcoding a relative node_modules path.
const require = createRequire(import.meta.url);
const treeSitterWasmsDir = path.dirname(
  require.resolve("tree-sitter-wasms/package.json"),
);
const webTreeSitterDir = path.dirname(
  require.resolve("web-tree-sitter/package.json"),
);

/**
 * vite-plugin-static-copy treats `src` as a glob pattern (via tinyglobby),
 * which -- unlike plain filesystem APIs -- does not accept Windows-style
 * backslash separators; `path.join`'s backslashes on Windows silently match
 * nothing ("No file was found to copy") even though the file exists on
 * disk. Force forward slashes so this works cross-platform.
 */
function toGlobPath(...segments: string[]): string {
  return path
    .join(...segments)
    .split(path.sep)
    .join("/");
}

const host = process.env["TAURI_DEV_HOST"];

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    wasm(),
    // Grammar .wasm files are fetched at runtime via web-tree-sitter's own
    // Language.load(url) (see src/worker/grammarAssets.ts) -- a plain fetch
    // of a static binary, not an ESM import -- so they need to be copied as
    // static assets rather than bundled. @ast-grep/wasm's own wasm_bg.wasm is
    // NOT copied here: it's pulled in via a real ESM import in
    // packages/core's ast-grep-wasm.adapter.ts, so vite-plugin-wasm bundles
    // it automatically.
    viteStaticCopy({
      targets: [
        {
          src: toGlobPath(
            treeSitterWasmsDir,
            "out/tree-sitter-javascript.wasm",
          ),
          dest: "grammars",
        },
        {
          src: toGlobPath(
            treeSitterWasmsDir,
            "out/tree-sitter-typescript.wasm",
          ),
          dest: "grammars",
        },
        // web-tree-sitter's own core runtime wasm (distinct from the
        // per-language grammar files above). Parser.init() is called with no
        // options from packages/core's grammar-loader.wasm.ts, so it falls
        // back to its bundler-default resolution for this file rather than
        // an explicit locateFile pointed at this copy -- see this app's
        // known-issues notes on why that resolution path is unverified.
        {
          src: toGlobPath(webTreeSitterDir, "tree-sitter.wasm"),
          dest: "grammars",
        },
      ],
    }),
  ],

  // Vite options tailored for Tauri development, per the Tauri v2 guide.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],

  // The Worker running packages/core's wasm build needs the exact same wasm
  // handling as the main bundle -- @ast-grep/wasm is only ever imported from
  // src/worker/engine.worker.ts (see that file), and that module graph is
  // bundled through this `worker` config, not the main `plugins` array above.
  //
  // NOTE: vite-plugin-top-level-await was tried here and dropped -- with the
  // pinned toolchain (vite-plugin-top-level-await@1.6.0, @swc/core@1.16.1,
  // rollup@4.63.1) it throws `[vite-plugin-top-level-await] missing field
  // 'type'` from inside its own generateBundle hook while processing the
  // Worker chunk, both when scoped to `worker.plugins` and when left in the
  // top-level `plugins` array (that hook runs over every emitted chunk,
  // worker chunks included). This reproduces on a clean build, not just in
  // this project's specific code, so it's a real tooling incompatibility in
  // that dependency combination -- see this app's build notes. Dropping it
  // is safe only because `build.target` below was also moved to 'esnext'
  // (see that setting's own comment) -- `vite-plugin-wasm` alone still needs
  // native top-level-await support from the target to do its
  // wasm-bindgen-style init.
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },

  build: {
    // Deliberately NOT the generic Tauri boilerplate's chrome105/safari13
    // pairing: that older baseline predates native top-level-await support,
    // which is exactly what would need `vite-plugin-top-level-await` to
    // polyfill -- and that plugin throws `missing field 'type'` from its own
    // generateBundle hook on this project's pinned toolchain (rollup 4.63,
    // @swc/core 1.16, the plugin's own 1.6.0), reproduced on a clean build
    // with nothing else changed. 'esnext' targets evergreen engines that
    // support top-level await (and wasm-bindgen's TLA-based init pattern)
    // natively, sidestepping the broken plugin entirely -- a reasonable
    // baseline for Tauri's bundled WebView2/WebKit versions at this point,
    // and a deliberate, documented deviation worth revisiting only if a
    // fixed release of the plugin (or a real need for a legacy-WebView
    // fallback) shows up later.
    target: "esnext",
    minify: !process.env["TAURI_ENV_DEBUG"] ? "esbuild" : false,
    sourcemap: !!process.env["TAURI_ENV_DEBUG"],
  },
}));
