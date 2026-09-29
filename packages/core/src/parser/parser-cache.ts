import type Parser from "web-tree-sitter-legacy";

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

/**
 * Caps how many parsed trees stay pinned in memory at once. A single-file
 * edit-and-reanalyze loop never comes close to this; a full workspace scan
 * over thousands of files would otherwise pin every tree (WASM-backed
 * native memory outside V8's heap limits) for the rest of the process's
 * life, compounding across repeated scans.
 */
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();

export async function parseWithCache(
  filePath: string,
  sourceCode: string,
  languageId: SupportedLanguageId,
): Promise<Parser.Tree> {
  const contentHash = hashContent(sourceCode);
  const existing = cache.get(filePath);
  if (existing && existing.contentHash === contentHash) {
    // Refresh recency for the LRU eviction below.
    cache.delete(filePath);
    cache.set(filePath, existing);
    return existing.tree;
  }

  const parser = await getParser(languageId);
  const tree = parser.parse(sourceCode);
  if (!tree) {
    throw new Error(`web-tree-sitter failed to parse ${filePath}`);
  }

  cache.delete(filePath);
  cache.set(filePath, { contentHash, tree });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }

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
