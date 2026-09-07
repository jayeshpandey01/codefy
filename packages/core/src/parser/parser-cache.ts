import type Parser from "web-tree-sitter";

import { hashContent } from "./content-hash.js";
import { getParser } from "./registry.js";
import type { SupportedLanguageId } from "./wasm-loader.js";

/**
 * Parse-tree cache keyed by content hash (not path alone) — see the
 * tree-sitter-parser skill's Core Rule #2. VS Code fires didChange events
 * aggressively; re-parsing on every keystroke is wasted work if the buffer
 * hasn't actually changed since the last analysis pass.
 */
interface CacheEntry {
  readonly contentHash: string;
  readonly tree: Parser.Tree;
}

const cache = new Map<string, CacheEntry>();

export async function parseWithCache(
  filePath: string,
  sourceCode: string,
  languageId: SupportedLanguageId,
): Promise<Parser.Tree> {
  const contentHash = hashContent(sourceCode);
  const existing = cache.get(filePath);
  if (existing && existing.contentHash === contentHash) {
    return existing.tree;
  }

  const parser = await getParser(languageId);
  const tree = parser.parse(sourceCode);
  if (!tree) {
    throw new Error(`web-tree-sitter failed to parse ${filePath}`);
  }

  cache.set(filePath, { contentHash, tree });
  return tree;
}

/** Evict a closed/deleted document from the cache so memory doesn't grow unbounded. */
export function evictFromCache(filePath: string): void {
  cache.delete(filePath);
}

/** Test-only: clears the whole cache. */
export function __clearParseCacheForTests(): void {
  cache.clear();
}
