import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

import Parser from "web-tree-sitter-legacy";

import type { SupportedLanguageId } from "./grammar-loader.types.js";

const requireTarget =
  (typeof import.meta !== "undefined" && import.meta.url)
    ? import.meta.url
    : (typeof __filename !== "undefined" && path.isAbsolute(__filename))
      ? __filename
      : `file://${process.cwd()}/index.js`;

const require = createRequire(requireTarget);

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
    initPromise = Parser.init({
      locateFile(scriptName: string, scriptDirectory: string) {
        const localCandidates = [
          path.join(__dirname, scriptName),
          path.join(__dirname, "dist", scriptName),
          path.join(scriptDirectory || "", scriptName),
        ];
        for (const candidate of localCandidates) {
          if (fs.existsSync(candidate)) return candidate;
        }
        return (scriptDirectory || "") + scriptName;
      },
    });
  }
  await initPromise;
}

function resolveGrammarWasmPath(specifier: string): string {
  try {
    return require.resolve(specifier);
  } catch {
    const filename = path.basename(specifier);
    const candidateDirs = [
      path.join(__dirname, "wasms"),
      path.join(__dirname, "..", "wasms"),
      path.join(__dirname, "tree-sitter-wasms"),
      path.join(__dirname, "out"),
    ];
    for (const dir of candidateDirs) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error(`Unable to resolve tree-sitter grammar wasm for "${specifier}"`);
  }
}

const languageCache = new Map<SupportedLanguageId, Promise<Parser.Language>>();

export async function loadLanguage(
  languageId: SupportedLanguageId,
): Promise<Parser.Language> {
  await ensureTreeSitterInitialized();

  const cached = languageCache.get(languageId);
  if (cached) return cached;

  const wasmPath = resolveGrammarWasmPath(GRAMMAR_MODULE_SPECIFIERS[languageId]);
  const promise = Parser.Language.load(wasmPath);
  languageCache.set(languageId, promise);
  return promise;
}
