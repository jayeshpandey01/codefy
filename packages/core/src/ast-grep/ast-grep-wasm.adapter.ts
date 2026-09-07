import { initializeTreeSitter, parse } from "@ast-grep/wasm";
import { parse as parseYaml } from "yaml";

import type { AstGrepMatch, IAstGrepAdapter } from "./types.js";

/** The shape of one of our src/rules/*.yml files, as parsed from YAML. */
interface AstGrepRuleFile {
  readonly id: string;
  readonly language: string;
  readonly rule: unknown;
  readonly constraints?: Record<string, unknown>;
  readonly utils?: Record<string, unknown>;
}

/** Every `$NAME`-style metavariable referenced anywhere in a rule's YAML text (excluding `$$$` rest-patterns). */
function extractMetaVariableNames(ruleYaml: string): string[] {
  const names = new Set<string>();
  const re = /\$([A-Z_][A-Z0-9_]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(ruleYaml))) {
    const name = match[1];
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * `@ast-grep/wasm`-backed implementation — runs inside the Tauri desktop
 * app's Web Worker (no Node runtime available there). Selected via the
 * "whoami-wasm" package.json#imports condition; see src/ast-grep/index.ts.
 *
 * Real end-to-end exercise of this adapter (loading the tree-sitter WASM
 * runtime and the per-language grammars it needs) happens inside the Tauri
 * webview/Worker environment built in apps/desktop-app — a browser-like
 * context with `fetch`/`WebAssembly` available the way this wasm build
 * expects. It is not exercised by this package's own (Node-only) test
 * suite, which pins its module resolution conditions to "whoami-node" and
 * therefore never loads this file at all.
 */
export class AstGrepWasmAdapter implements IAstGrepAdapter {
  private initPromise: Promise<void> | undefined;

  async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = initializeTreeSitter();
    }
    await this.initPromise;
  }

  findMatches(sourceCode: string, ruleYaml: string): AstGrepMatch[] {
    if (!this.initPromise) {
      throw new Error(
        "AstGrepWasmAdapter.initialize() must be awaited before findMatches() — the wasm " +
          "tree-sitter runtime has to load first.",
      );
    }

    const ruleFile = parseYaml(ruleYaml) as AstGrepRuleFile;
    const root = parse(ruleFile.language, sourceCode);
    const rootNode = root.root();

    const matches = rootNode.findAll({
      rule: ruleFile.rule,
      ...(ruleFile.constraints ? { constraints: ruleFile.constraints } : {}),
      ...(ruleFile.utils ? { utils: ruleFile.utils } : {}),
    });
    const metaVariableNames = extractMetaVariableNames(ruleYaml);

    return matches.map((match) => {
      const range = match.range();
      const captures: Record<string, string> = {};
      for (const name of metaVariableNames) {
        const captured = match.getMatch(name);
        if (captured) {
          captures[name] = captured.text();
        }
      }
      return {
        ruleId: ruleFile.id,
        startLine: range.start.line + 1,
        endLine: range.end.line + 1,
        matchText: match.text(),
        captures,
      };
    });
  }
}

export function createAstGrepAdapter(): IAstGrepAdapter {
  return new AstGrepWasmAdapter();
}
