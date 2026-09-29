#!/usr/bin/env node
"use strict";

/**
 * Two separate esbuild bundles:
 *  - host:    src/extension.ts    -> dist/extension.js    (Node, CJS -- this
 *             is what VS Code `require()`s as the extension's `main`)
 *  - webview: src/webview/main.tsx -> dist/webview/main.js (browser, IIFE)
 *
 * esbuild's built-in CSS loader picks up the `@whoami/ui/styles.css` side-
 * effect import from main.tsx and emits dist/webview/main.css alongside the
 * JS automatically -- no separate CSS build step needed.
 *
 * This file is plain CommonJS on purpose: apps/vscode-extension/package.json
 * has no "type": "module", because dist/extension.js (esbuild format 'cjs')
 * must be loadable via Node's require() by the VS Code extension host. A
 * "type": "module" package.json would make Node treat dist/extension.js as
 * ESM and require() would fail with ERR_REQUIRE_ESM.
 */

const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const hostConfig = {
  entryPoints: [path.join(root, "src/extension.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(root, "dist/extension.js"),
  // Never bundle:
  //  - vscode: provided by the host.
  //  - @ast-grep/napi: a native addon -- its own require()-based
  //    platform-binary loading must stay intact.
  //  - web-tree-sitter-legacy: resolves its own runtime tree-sitter.wasm relative
  //    to its module's own __dirname at load time (verified against its
  //    actual source: `scriptDirectory = __dirname + "/"`). Bundling it
  //    would make that __dirname resolve to dist/ instead of
  //    node_modules/web-tree-sitter-legacy/, breaking wasm loading. Declared as a
  //    direct dependency of this app (like @ast-grep/napi) so it's
  //    physically resolvable once pnpm deploy relocates the bundle.
  external: [
    "vscode",
    "@ast-grep/napi",
    "web-tree-sitter",
    "web-tree-sitter-legacy",
  ],
  sourcemap: true,
  logLevel: "info", minify: !watch,
  // @whoami/core's dist-node/index.js (bundled in, NOT external -- it's the
  // whole point of this bundle) uses `createRequire(import.meta.url)` in its
  // Node grammar loader (to require.resolve() tree-sitter-wasms' .wasm
  // assets off the real filesystem). esbuild empties import.meta.url under
  // the "cjs" output format, which makes createRequire(undefined) throw at
  // module-load time -- verified empirically: `require('./dist/extension.js')`
  // threw ERR_INVALID_ARG_VALUE before this fix. This is esbuild's own
  // documented workaround: redefine `import.meta.url` to a banner-injected
  // constant built from __filename, which IS valid in a cjs bundle.
  banner: {
    js: "const __whoamiImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  define: {
    "import.meta.url": "__whoamiImportMetaUrl",
  },
  logOverride: {
    "empty-import-meta": "silent",
  },
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: [path.join(root, "src/webview/main.tsx")],
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "iife",
  jsx: "automatic",
  outfile: path.join(root, "dist/webview/main.js"),
  loader: { ".css": "css" },
  sourcemap: true,
  logLevel: "info", minify: !watch,
  logOverride: {
    "equals-negative-zero": "silent",
    "duplicate-case": "silent",
  },
};

async function run() {
  if (watch) {
    const [hostCtx, webviewCtx] = await Promise.all([
      esbuild.context(hostConfig),
      esbuild.context(webviewConfig),
    ]);
    await Promise.all([hostCtx.watch(), webviewCtx.watch()]);
    console.log("[whoami] esbuild watching host + webview bundles...");
  } else {
    await Promise.all([
      esbuild.build(hostConfig),
      esbuild.build(webviewConfig),
    ]);
    console.log(
      "[whoami] build complete: dist/extension.js + dist/webview/main.js",
    );
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
