/**
 * Resolves the base URL that this app's tree-sitter grammar `.wasm` files are
 * served from at runtime.
 *
 * vite.config.ts's `viteStaticCopy` targets copy `tree-sitter-wasms`' grammar
 * files (and web-tree-sitter's own core `tree-sitter.wasm`) into a
 * `grammars/` folder at the build output root, both in dev (served by Vite's
 * dev server) and in the built app (served from Tauri's bundled asset root).
 * That output-root placement -- not chunk-relative -- is why this resolves
 * against `self.location` (root-relative `/grammars/`) rather than
 * `import.meta.url` (which would be relative to wherever this Worker's own
 * bundled chunk happens to land, e.g. `/assets/engine.worker-<hash>.js`, and
 * would need adjusting every time that chunk's nesting depth changed).
 *
 * `self` here is the Worker's own `DedicatedWorkerGlobalScope` (this file is
 * only ever imported from within the Worker -- see engine.worker.ts), which
 * inherits its origin from the page that spawned it, so this is safe under
 * both Vite's dev server (http://localhost:1420) and Tauri's custom asset
 * protocol alike.
 */
export function resolveGrammarBaseUrl(): string {
  return new URL("/grammars/", self.location.href).href;
}

/** Modern parser grammars registered by @ast-grep/wasm. */
export function resolveAstGrepGrammarBaseUrl(): string {
  return new URL("/ast-grep-grammars/", self.location.href).href;
}
