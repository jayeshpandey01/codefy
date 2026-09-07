/**
 * Supported grammar language IDs available in tree-sitter-wasms.
 */
export type SupportedLanguageId =
  | "typescript"
  | "tsx"
  | "javascript"
  | "python"
  | "json"
  | "html"
  | "css"
  | "go"
  | "rust"
  | "java"
  | "c"
  | "cpp"
  | "c_sharp"
  | "php"
  | "ruby"
  | "yaml"
  | "toml"
  | "bash"
  | "kotlin"
  | "swift"
  | "vue"
  | "dart"
  | "lua"
  | "solidity";

const EXTENSION_MAP: Record<string, SupportedLanguageId> = {
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".json": "json",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "c_sharp",
  ".php": "php",
  ".rb": "ruby",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sh": "bash",
  ".bash": "bash",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".swift": "swift",
  ".vue": "vue",
  ".dart": "dart",
  ".lua": "lua",
  ".sol": "solidity",
};

/** Resolves the matching tree-sitter SupportedLanguageId from a file's path/extension. */
export function getLanguageForFile(
  filePath: string,
): SupportedLanguageId | undefined {
  const dotIndex = filePath.lastIndexOf(".");
  if (dotIndex === -1) return undefined;
  const ext = filePath.slice(dotIndex).toLowerCase();
  return EXTENSION_MAP[ext];
}
