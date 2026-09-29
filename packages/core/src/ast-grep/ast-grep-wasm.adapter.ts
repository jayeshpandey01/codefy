import {
  initializeTreeSitter,
  parse,
  registerDynamicLanguage,
} from "@ast-grep/wasm";
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

interface CompiledRule {
  readonly id: string;
  readonly language: string;
  readonly ruleConfig: {
    rule: unknown;
    constraints?: Record<string, unknown>;
    utils?: Record<string, unknown>;
  };
  readonly metaVariableNames: readonly string[];
}

const compiledRuleCache = new Map<string, CompiledRule>();
let grammarBaseUrl: string | undefined;

/** Set the URL containing modern, ast-grep-compatible parser grammars. */
export function configureAstGrepGrammarBaseUrl(baseUrl: string): void {
  grammarBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

async function verifyGrammarAsset(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Tree-sitter grammar request failed: ${url} returned HTTP ${response.status} ${response.statusText}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const hasWasmSignature =
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d;
  if (!hasWasmSignature) {
    const prefix = Array.from(bytes.slice(0, 8), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(" ");
    throw new Error(
      `Tree-sitter grammar request returned non-WASM data: ${url} ` +
        `(content-type=${response.headers.get("content-type") ?? "unknown"}, ` +
        `bytes=${bytes.length}, prefix=${prefix || "empty"}). Check that this WASM ` +
        `asset is copied to and served from the configured grammar directory.`,
    );
  }
}

function getCompiledRule(ruleYaml: string): CompiledRule {
  const cached = compiledRuleCache.get(ruleYaml);
  if (cached) return cached;

  const ruleFile = parseYaml(ruleYaml) as AstGrepRuleFile;
  const ruleConfig = {
    rule: ruleFile.rule,
    ...(ruleFile.constraints ? { constraints: ruleFile.constraints } : {}),
    ...(ruleFile.utils ? { utils: ruleFile.utils } : {}),
  };
  const metaVariableNames = extractMetaVariableNames(ruleYaml);

  const compiled: CompiledRule = {
    id: ruleFile.id,
    language: ruleFile.language,
    ruleConfig,
    metaVariableNames,
  };
  compiledRuleCache.set(ruleYaml, compiled);
  return compiled;
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
      this.initPromise = (async () => {
        if (!grammarBaseUrl) {
          throw new Error(
            "configureAstGrepGrammarBaseUrl() must be called before initializing the desktop ast-grep WASM adapter.",
          );
        }
        const baseUrl = grammarBaseUrl;
        await initializeTreeSitter();
        const grammar = (name: string) => ({
          libraryPath: new URL(`tree-sitter-${name}.wasm`, baseUrl).href,
        });
        const grammarUrls = ["typescript", "javascript", "tsx"].map(
          (name) => new URL(`tree-sitter-${name}.wasm`, baseUrl).href,
        );
        await Promise.all(grammarUrls.map(verifyGrammarAsset));
        await registerDynamicLanguage({
          TypeScript: grammar("typescript"),
          typescript: grammar("typescript"),
          JavaScript: grammar("javascript"),
          javascript: grammar("javascript"),
          TSX: grammar("tsx"),
          tsx: grammar("tsx"),
        });
      })();
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

    const compiled = getCompiledRule(ruleYaml);
    const root = parse(compiled.language, sourceCode);
    const rootNode = root.root();

    const matches = rootNode.findAll(compiled.ruleConfig);

    return matches.map((match) => {
      const range = match.range();
      const captures: Record<string, string> = {};
      for (const name of compiled.metaVariableNames) {
        const captured = match.getMatch(name);
        if (captured) {
          captures[name] = captured.text();
        }
      }
      return {
        ruleId: compiled.id,
        startLine: range.start.line + 1,
        endLine: range.end.line + 1,
        matchText: match.text(),
        captures,
      };
    });
  }

  findMatchesForAllRules(
    sourceCode: string,
    rules: readonly string[],
  ): AstGrepMatch[] {
    if (!this.initPromise) {
      throw new Error(
        "AstGrepWasmAdapter.initialize() must be awaited before findMatchesForAllRules() — the wasm " +
          "tree-sitter runtime has to load first.",
      );
    }
    if (rules.length === 0) return [];

    const compiledRules = rules.map(getCompiledRule);
    const rootsByLang = new Map<string, ReturnType<typeof parse>>();
    const allMatches: AstGrepMatch[] = [];

    for (const compiled of compiledRules) {
      let root = rootsByLang.get(compiled.language);
      if (!root) {
        root = parse(compiled.language, sourceCode);
        rootsByLang.set(compiled.language, root);
      }

      const rootNode = root.root();
      const matches = rootNode.findAll(compiled.ruleConfig);

      for (const match of matches) {
        const range = match.range();
        const captures: Record<string, string> = {};
        for (const name of compiled.metaVariableNames) {
          const captured = match.getMatch(name);
          if (captured) {
            captures[name] = captured.text();
          }
        }
        allMatches.push({
          ruleId: compiled.id,
          startLine: range.start.line + 1,
          endLine: range.end.line + 1,
          matchText: match.text(),
          captures,
        });
      }
    }

    return allMatches;
  }
}

export function createAstGrepAdapter(): IAstGrepAdapter {
  return new AstGrepWasmAdapter();
}
