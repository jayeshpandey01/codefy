import Parser from "web-tree-sitter";

import { loadLanguage, type SupportedLanguageId } from "./wasm-loader.js";

/**
 * One Parser instance per language, reused across files — see the
 * tree-sitter-parser skill's Core Rule #1. Creating a fresh Parser (or
 * reloading its grammar) per file/per keystroke is the single biggest perf
 * mistake here.
 */
const parsers = new Map<SupportedLanguageId, Promise<Parser>>();

export async function getParser(
  languageId: SupportedLanguageId,
): Promise<Parser> {
  const cached = parsers.get(languageId);
  if (cached) return cached;

  const promise = (async () => {
    const language = await loadLanguage(languageId);
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  })();

  parsers.set(languageId, promise);
  return promise;
}

/** Test-only: forces the next getParser() call to build a fresh instance. */
export function __resetParserRegistryForTests(): void {
  parsers.clear();
}
