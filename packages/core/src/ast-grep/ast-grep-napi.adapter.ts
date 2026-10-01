import * as path from "node:path";
import { createRequire } from "node:module";
import type { Lang, NapiConfig } from "@ast-grep/napi";
import { parse as parseYaml } from "yaml";

import type { AstGrepMatch, IAstGrepAdapter } from "./types.js";

const requireTarget =
  (typeof import.meta !== "undefined" && import.meta.url)
    ? import.meta.url
    : (typeof __filename !== "undefined" && path.isAbsolute(__filename))
      ? __filename
      : `file://${process.cwd()}/index.js`;

const nodeRequire = createRequire(requireTarget);

interface AstGrepNapiModule {
  Lang: typeof import("@ast-grep/napi").Lang;
  parse: typeof import("@ast-grep/napi").parse;
}

let loadedNapi: AstGrepNapiModule | null | undefined;

function getNapi(): AstGrepNapiModule | null {
  if (loadedNapi !== undefined) {
    return loadedNapi;
  }
  try {
    const mod = nodeRequire("@ast-grep/napi") as AstGrepNapiModule;
    if (mod && mod.Lang && typeof mod.parse === "function") {
      loadedNapi = mod;
      return loadedNapi;
    }
  } catch (err) {
    console.warn(
      "[WhoAmI] @ast-grep/napi native addon not available; ast-grep pattern matching will be skipped:",
      err,
    );
  }
  loadedNapi = null;
  return null;
}

/** The shape of one of our src/rules/*.yml files, as parsed from YAML. */
interface AstGrepRuleFile {
  readonly id: string;
  readonly language: string;
  readonly rule: unknown;
  readonly constraints?: Record<string, unknown>;
  readonly utils?: Record<string, unknown>;
}

function resolveLang(language: string): Lang | null {
  const napi = getNapi();
  if (!napi) return null;
  const lang = (napi.Lang as Record<string, Lang>)[language];
  return lang ?? null;
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
  readonly lang: Lang;
  readonly config: NapiConfig;
  readonly metaVariableNames: readonly string[];
}

const compiledRuleCache = new Map<string, CompiledRule>();

function getCompiledRule(ruleYaml: string): CompiledRule | null {
  const cached = compiledRuleCache.get(ruleYaml);
  if (cached) return cached;

  const napi = getNapi();
  if (!napi) return null;

  try {
    const ruleFile = parseYaml(ruleYaml) as AstGrepRuleFile;
    const lang = resolveLang(ruleFile.language);
    if (!lang) return null;

    const config: NapiConfig = {
      rule: ruleFile.rule as NapiConfig["rule"],
      ...(ruleFile.constraints
        ? { constraints: ruleFile.constraints as NapiConfig["constraints"] }
        : {}),
      ...(ruleFile.utils ? { utils: ruleFile.utils as NapiConfig["utils"] } : {}),
    };
    const metaVariableNames = extractMetaVariableNames(ruleYaml);

    const compiled: CompiledRule = {
      id: ruleFile.id,
      lang,
      config,
      metaVariableNames,
    };
    compiledRuleCache.set(ruleYaml, compiled);
    return compiled;
  } catch {
    return null;
  }
}

/**
 * `@ast-grep/napi`-backed implementation — runs in the VS Code extension
 * host (real Node.js). Selected via the "whoami-node" package.json#imports
 * condition; see src/ast-grep/index.ts.
 */
export class AstGrepNapiAdapter implements IAstGrepAdapter {
  // No async setup needed — the native addon is ready as soon as it's required.
  async initialize(): Promise<void> {
    // intentionally empty
  }

  findMatches(sourceCode: string, ruleYaml: string): AstGrepMatch[] {
    const napi = getNapi();
    if (!napi) return [];

    const compiled = getCompiledRule(ruleYaml);
    if (!compiled) return [];

    try {
      const root = napi.parse(compiled.lang, sourceCode);
      const rootNode = root.root();
      const matches = rootNode.findAll(compiled.config);

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
          // ast-grep's Pos.line is 0-based; AstGrepMatch is documented as 1-based.
          startLine: range.start.line + 1,
          endLine: range.end.line + 1,
          matchText: match.text(),
          captures,
        };
      });
    } catch {
      return [];
    }
  }

  findMatchesForAllRules(
    sourceCode: string,
    rules: readonly string[],
  ): AstGrepMatch[] {
    if (rules.length === 0) return [];
    const napi = getNapi();
    if (!napi) return [];

    const compiledRules = rules
      .map(getCompiledRule)
      .filter((r): r is CompiledRule => r !== null);
    if (compiledRules.length === 0) return [];

    const rootsByLang = new Map<Lang, ReturnType<typeof napi.parse>>();
    const allMatches: AstGrepMatch[] = [];

    for (const compiled of compiledRules) {
      try {
        let root = rootsByLang.get(compiled.lang);
        if (!root) {
          root = napi.parse(compiled.lang, sourceCode);
          rootsByLang.set(compiled.lang, root);
        }

        const rootNode = root.root();
        const matches = rootNode.findAll(compiled.config);

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
      } catch {
        // Skip individual failing rule
      }
    }

    return allMatches;
  }
}

export function createAstGrepAdapter(): IAstGrepAdapter {
  return new AstGrepNapiAdapter();
}

/** The Node adapter loads built-in parsers and does not need external WASM assets. */
export function configureAstGrepGrammarBaseUrl(_baseUrl: string): void {}
