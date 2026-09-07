import { Lang, parse } from "@ast-grep/napi";
import type { NapiConfig } from "@ast-grep/napi";
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

function resolveLang(language: string): Lang {
  const lang = (Lang as Record<string, Lang>)[language];
  if (!lang) {
    throw new Error(`Unsupported ast-grep language: "${language}"`);
  }
  return lang;
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
    const ruleFile = parseYaml(ruleYaml) as AstGrepRuleFile;
    const lang = resolveLang(ruleFile.language);
    const root = parse(lang, sourceCode);
    const rootNode = root.root();

    const config: NapiConfig = {
      rule: ruleFile.rule as NapiConfig["rule"],
      ...(ruleFile.constraints
        ? { constraints: ruleFile.constraints as NapiConfig["constraints"] }
        : {}),
      ...(ruleFile.utils
        ? { utils: ruleFile.utils as NapiConfig["utils"] }
        : {}),
    };

    const matches = rootNode.findAll(config);
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
        // ast-grep's Pos.line is 0-based; AstGrepMatch is documented as 1-based.
        startLine: range.start.line + 1,
        endLine: range.end.line + 1,
        matchText: match.text(),
        captures,
      };
    });
  }
}

export function createAstGrepAdapter(): IAstGrepAdapter {
  return new AstGrepNapiAdapter();
}
