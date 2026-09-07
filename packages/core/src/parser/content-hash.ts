/**
 * A small, dependency-free, deterministic string hash used purely as a
 * parse-tree cache key (see parser-cache.ts) — not a cryptographic hash, no
 * collision-resistance guarantee needed (worst case on a collision is one
 * avoidable re-parse, not a correctness bug). Kept free of any platform API
 * (no node:crypto, no SubtleCrypto) so the exact same code runs unchanged
 * in both the Node extension-host build and the browser/Worker wasm build
 * — unlike ast-grep's adapter, this piece of the parser layer has no
 * reason to be platform-split at all.
 */
export function hashContent(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0")
  );
}
