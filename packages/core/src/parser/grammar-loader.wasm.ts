import Parser from "web-tree-sitter-legacy";
import { VercelError } from "@whoami/types";

import type { SupportedLanguageId } from "./grammar-loader.types.js";

let grammarBaseUrl: string | undefined;

/** Must be called once, before the first loadLanguage(), from the consuming app's own Worker bootstrap. */
export function configureGrammarBaseUrl(baseUrl: string): void {
  grammarBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

const GRAMMAR_FILE_NAMES: Record<SupportedLanguageId, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  json: "tree-sitter-json.wasm",
  html: "tree-sitter-html.wasm",
  css: "tree-sitter-css.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
  java: "tree-sitter-java.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  c_sharp: "tree-sitter-c_sharp.wasm",
  php: "tree-sitter-php.wasm",
  ruby: "tree-sitter-ruby.wasm",
  yaml: "tree-sitter-yaml.wasm",
  toml: "tree-sitter-toml.wasm",
  bash: "tree-sitter-bash.wasm",
  kotlin: "tree-sitter-kotlin.wasm",
  swift: "tree-sitter-swift.wasm",
  vue: "tree-sitter-vue.wasm",
  dart: "tree-sitter-dart.wasm",
  lua: "tree-sitter-lua.wasm",
  solidity: "tree-sitter-solidity.wasm",
};

let initPromise: Promise<void> | undefined;

/** Idempotent — safe to call from multiple call sites. */
export async function ensureTreeSitterInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = Parser.init({
      locateFile: (fileName: string) => {
        if (!grammarBaseUrl) return fileName;
        return `${grammarBaseUrl}/${fileName}`;
      },
    });
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

  if (!grammarBaseUrl) {
    throw new VercelError(
      "configureGrammarBaseUrl() must be called before loadLanguage() in the wasm build — " +
        "point it at wherever tree-sitter-wasms' grammar .wasm files are served as static assets.",
      {
        code: "missing_grammar_base_url",
        scope: "parser",
        reason:
          "Tree-sitter WASM grammars need a base URL to fetch .wasm assets in the browser/webview environment.",
        hint: "Call configureGrammarBaseUrl(url) during Worker bootstrap.",
        fix: "Pass the URL path where tree-sitter-wasms static files are served.",
      },
    );
  }

  const url = `${grammarBaseUrl}/${GRAMMAR_FILE_NAMES[languageId]}`;
  const promise = Parser.Language.load(url);
  languageCache.set(languageId, promise);
  return promise;
}
