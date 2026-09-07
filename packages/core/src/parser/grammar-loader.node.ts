import { createRequire } from "node:module";

import Parser from "web-tree-sitter";

import type { SupportedLanguageId } from "./grammar-loader.types.js";

const require = createRequire(import.meta.url);

const GRAMMAR_MODULE_SPECIFIERS: Record<SupportedLanguageId, string> = {
  typescript: "tree-sitter-wasms/out/tree-sitter-typescript.wasm",
  tsx: "tree-sitter-wasms/out/tree-sitter-tsx.wasm",
  javascript: "tree-sitter-wasms/out/tree-sitter-javascript.wasm",
  python: "tree-sitter-wasms/out/tree-sitter-python.wasm",
  json: "tree-sitter-wasms/out/tree-sitter-json.wasm",
  html: "tree-sitter-wasms/out/tree-sitter-html.wasm",
  css: "tree-sitter-wasms/out/tree-sitter-css.wasm",
  go: "tree-sitter-wasms/out/tree-sitter-go.wasm",
  rust: "tree-sitter-wasms/out/tree-sitter-rust.wasm",
  java: "tree-sitter-wasms/out/tree-sitter-java.wasm",
  c: "tree-sitter-wasms/out/tree-sitter-c.wasm",
  cpp: "tree-sitter-wasms/out/tree-sitter-cpp.wasm",
  c_sharp: "tree-sitter-wasms/out/tree-sitter-c_sharp.wasm",
  php: "tree-sitter-wasms/out/tree-sitter-php.wasm",
  ruby: "tree-sitter-wasms/out/tree-sitter-ruby.wasm",
  yaml: "tree-sitter-wasms/out/tree-sitter-yaml.wasm",
  toml: "tree-sitter-wasms/out/tree-sitter-toml.wasm",
  bash: "tree-sitter-wasms/out/tree-sitter-bash.wasm",
  kotlin: "tree-sitter-wasms/out/tree-sitter-kotlin.wasm",
  swift: "tree-sitter-wasms/out/tree-sitter-swift.wasm",
  vue: "tree-sitter-wasms/out/tree-sitter-vue.wasm",
  dart: "tree-sitter-wasms/out/tree-sitter-dart.wasm",
  lua: "tree-sitter-wasms/out/tree-sitter-lua.wasm",
  solidity: "tree-sitter-wasms/out/tree-sitter-solidity.wasm",
};

/**
 * No-op in Node build — kept so both grammar loaders share one API surface.
 */
export function configureGrammarBaseUrl(_baseUrl: string): void {
  // intentionally empty
}

let initPromise: Promise<void> | undefined;

/** Idempotent — safe to call from multiple call sites. */
export async function ensureTreeSitterInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init();
  }
  await initPromise;
}

const languageCache = new Map<SupportedLanguageId, Promise<Parser.Language>>();

export async function loadLanguage(
  languageId: SupportedLanguageId,
): Promise<Parser.Language> {
  await ensureTreeSitterInitialized();

  const cached = languageCache.get(languageId);
  if (cached) return cached;

  const wasmPath = require.resolve(GRAMMAR_MODULE_SPECIFIERS[languageId]);
  const promise = Parser.Language.load(wasmPath);
  languageCache.set(languageId, promise);
  return promise;
}
