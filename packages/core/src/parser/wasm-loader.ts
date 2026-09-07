/**
 * Stable public import path for the platform-specific grammar loader — the
 * same "internal subpath import + package.json#imports condition" pattern
 * used for src/ast-grep/index.ts, applied here because
 * grammar-loader.node.ts needs a real filesystem (via `require.resolve`)
 * that simply doesn't exist inside a Tauri webview Worker.
 */
export { configureGrammarBaseUrl } from "#tree-sitter-grammar-loader";
export {
  ensureTreeSitterInitialized,
  loadLanguage,
} from "#tree-sitter-grammar-loader";
export { getLanguageForFile } from "./grammar-loader.types.js";
export type { SupportedLanguageId } from "./grammar-loader.types.js";
