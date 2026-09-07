/**
 * The seam every ast-grep usage in this package must go through. Two concrete
 * implementations exist — one backed by `@ast-grep/napi` (Node/extension host),
 * one backed by `@ast-grep/wasm` (Tauri webview) — selected at build time via
 * the `#ast-grep-adapter` package.json#imports condition, never by branching
 * inside detector code. See src/ast-grep/index.ts and the CLAUDE.md ADR
 * "Why ast-grep Is Dual-Built (napi + wasm)".
 */

/** One match produced by running a single ast-grep YAML rule against one file's source text. */
export interface AstGrepMatch {
  /** The `id` field from the matched rule's YAML (e.g. "js-command-injection-exec"). */
  readonly ruleId: string;
  /** 1-based, inclusive start line of the match. */
  readonly startLine: number;
  /** 1-based, inclusive end line of the match. */
  readonly endLine: number;
  /** The exact source text the rule matched. */
  readonly matchText: string;
  /**
   * Source text of each named ast-grep metavariable captured by the rule's
   * pattern (e.g. `$CMD`, `$URL`), keyed by name without the leading `$`.
   * Used by src/taint/propagate.ts to identify which argument is the
   * tainted one for a given sink rule (see src/taint/sinks.ts).
   */
  readonly captures: Readonly<Record<string, string>>;
}

export interface IAstGrepAdapter {
  /**
   * One-time async setup, if the backing implementation needs it (the wasm
   * build must load the tree-sitter WASM runtime before it can parse anything;
   * the napi build needs nothing and resolves immediately). Callers must await
   * this — if present — before the first `findMatches` call. Idempotent.
   */
  initialize?(): Promise<void>;

  /**
   * Parse `sourceCode` and run the single rule described by `ruleYaml` (the
   * verbatim contents of one file under src/rules/*.yml) against it, returning
   * every match found. Never throws on a rule that simply finds nothing —
   * returns an empty array instead.
   */
  findMatches(sourceCode: string, ruleYaml: string): AstGrepMatch[];
}
