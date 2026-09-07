---
name: tree-sitter-parser
description: Use when parsing source files into ASTs inside packages/core with web-tree-sitter — loading WASM grammars, writing tree-sitter queries, walking/caching parse trees, or adding support for a new source language.
---

# Tree-Sitter Parser (packages/core)

Guidance for the in-process AST layer that every detector and the taint engine build on. `web-tree-sitter` is the only parsing dependency — no Python, no native Node bindings, no external process.

## Where this lives

- `packages/core/src/parser/` — grammar loading, parse tree cache, query runner.
- Grammar `.wasm` files ship as static assets bundled with the extension/desktop app (not fetched at runtime).

## Core rules

1. **One `Parser` instance per language, reused across files.** Creating a new `Parser`/loading the WASM grammar per file is the single biggest perf mistake here — initialize once at engine startup, cache by language id.
2. **Cache parse trees per file, keyed by content hash or version, not by path alone.** VS Code fires didChange events aggressively; re-parsing on every keystroke is wasted work if the buffer hasn't actually changed since the last analysis pass.
3. **Prefer tree-sitter queries (`.scm` patterns) over manual tree-walking** for source/sink/sanitizer matching. Queries are declarative, testable in isolation, and match the mental model detectors use (pattern → capture → classify).
4. **Incremental parsing when editing, not full re-parse.** Use `tree.edit()` + `parser.parse(newText, oldTree)` when you have a known edit range (e.g. from a VS Code `TextDocumentChangeEvent`). Full re-parse is fine for the initial scan of a file.
5. **Never let a parse failure crash the pipeline.** Tree-sitter parsers are error-tolerant by design (they produce a tree with ERROR nodes rather than throwing) — detectors must check for and skip/degrade around ERROR nodes rather than assume a clean tree.

## Adding a new language

1. Add the grammar's `.wasm` to the bundled assets.
2. Register it in the parser registry (`packages/core/src/parser/registry.ts`) keyed by VS Code language id.
3. Write source/sink/sanitizer queries for that language under `packages/core/src/detectors/<language>/queries/`.
4. Add fixture files under `packages/core/src/__tests__/fixtures/<language>/` and a corresponding detector test — see [[taint-engine]] for the fixture-driven test pattern.

## Anti-patterns to avoid

- Do not shell out to a CLI tree-sitter binary — defeats the "no external runtime" principle from CLAUDE.md.
- Do not build a second, ad-hoc regex-based scanner "just for this one case" — if a query can express it, use a query; keeps detection logic in one place.
- Do not hold parse trees for closed/deleted documents — evict from the cache on document close to bound memory.

## Related

- [[taint-engine]] — consumes the AST/queries produced here to build source→sink paths.
