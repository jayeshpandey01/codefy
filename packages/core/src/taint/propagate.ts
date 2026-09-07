import type { CandidatePath, TaintStep } from "@whoami/types";
import type Parser from "web-tree-sitter";

import type { AstGrepMatch } from "../ast-grep/index.js";
import { parseWithCache } from "../parser/parser-cache.js";
import { findSourceMatch } from "./sources.js";
import type { SinkRuleBinding } from "./sinks.js";

const MAX_TRACE_DEPTH = 8;
const MAX_LABEL_LENGTH = 120;

const SIMPLE_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const FUNCTION_LIKE_KINDS = [
  "function_declaration",
  "function_expression",
  "generator_function_declaration",
  "arrow_function",
  "method_definition",
];

interface StatementDeclaration {
  readonly index: number;
  /** 1-based line number. */
  readonly line: number;
  readonly initializerText: string;
}

function truncate(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > MAX_LABEL_LENGTH
    ? `${singleLine.slice(0, MAX_LABEL_LENGTH)}…`
    : singleLine;
}

/**
 * Walks up from the AST position at `row0` (real tree ancestry, not a
 * line-range heuristic — see the note below on why that matters) to the
 * nearest enclosing function-like node, and returns its statement_block
 * body.
 *
 * A naive "smallest function whose [startLine, endLine] contains row0"
 * check breaks on exactly the command-injection shape this engine has to
 * handle: `child_process.exec(cmd, (err, stdout) => { ... })` — the
 * callback argument is itself a function-like node whose line range
 * coincidentally starts on the very same row as the sink call, even though
 * it is a *descendant* of that call, not its ancestor. Walking real parent
 * links instead of comparing line ranges avoids ever picking that inner
 * callback as the "enclosing" function.
 */
function findEnclosingFunctionBody(
  root: Parser.SyntaxNode,
  row0: number,
): Parser.SyntaxNode | null {
  let node: Parser.SyntaxNode | null = root.descendantForPosition({
    row: row0,
    column: 0,
  });

  while (node) {
    if (FUNCTION_LIKE_KINDS.includes(node.type)) {
      const body = node.childForFieldName("body");
      return body && body.type === "statement_block" ? body : null;
    }
    node = node.parent;
  }
  return null;
}

function findStatementIndexForRow(
  statements: readonly Parser.SyntaxNode[],
  row0: number,
): number {
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]!;
    if (stmt.startPosition.row <= row0 && row0 <= stmt.endPosition.row) {
      return i;
    }
  }
  let fallback = -1;
  for (let i = 0; i < statements.length; i += 1) {
    if (statements[i]!.startPosition.row <= row0) fallback = i;
  }
  return fallback;
}

function findVariableDeclarationFor(
  statements: readonly Parser.SyntaxNode[],
  beforeIndex: number,
  identifierName: string,
): StatementDeclaration | null {
  for (let i = beforeIndex - 1; i >= 0; i -= 1) {
    const stmt = statements[i]!;
    if (
      stmt.type !== "lexical_declaration" &&
      stmt.type !== "variable_declaration"
    )
      continue;

    for (const declarator of stmt.namedChildren) {
      if (declarator.type !== "variable_declarator") continue;
      const nameNode = declarator.childForFieldName("name");
      const valueNode = declarator.childForFieldName("value");
      if (nameNode?.text === identifierName && valueNode) {
        return {
          index: i,
          line: stmt.startPosition.row + 1,
          initializerText: valueNode.text,
        };
      }
    }
  }
  return null;
}

/** Pulls candidate tainted operands out of a template literal or `+` concatenation. */
function extractSubExpressions(text: string): string[] {
  const results: string[] = [];
  const templateRe = /\$\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = templateRe.exec(text))) {
    if (match[1]) results.push(match[1].trim());
  }
  if (results.length > 0) return results;

  if (text.includes("+")) {
    return text
      .split("+")
      .map((part) => part.trim().replace(/^['"`]|['"`]$/g, ""))
      .filter((part) => part.length > 0);
  }

  return [];
}

/**
 * Bounded backward data-flow resolution: does `text` (the sink's tainted
 * argument, or something it was assigned from) ultimately originate from a
 * known source (see src/taint/sources.ts)? Real, if intentionally scoped,
 * AST-based tracing — single file, single enclosing function, at most
 * MAX_TRACE_DEPTH hops through variable declarations and template/`+`
 * operands — per CLAUDE.md's "AST-based data-flow tracing" and the
 * taint-engine skill's fixture-driven scope for Phase 1.
 */
function resolveTaint(
  text: string,
  atLine: number,
  statements: readonly Parser.SyntaxNode[],
  beforeIndex: number,
  depth: number,
  steps: TaintStep[],
  filePath: string,
): boolean {
  const direct = findSourceMatch(text);
  if (direct) {
    steps.push({ role: "source", label: direct.label, filePath, line: atLine });
    return true;
  }

  if (depth <= 0) return false;

  const trimmed = text.trim();
  if (SIMPLE_IDENTIFIER_RE.test(trimmed)) {
    const decl = findVariableDeclarationFor(statements, beforeIndex, trimmed);
    if (!decl) {
      // If the identifier cannot be resolved to an internal declaration in the same function,
      // it originates from a function parameter, module import, or caller argument.
      if (!/^(true|false|null|undefined|NaN|Infinity)$/.test(trimmed)) {
        steps.push({
          role: "source",
          label: `Input parameter: ${trimmed}`,
          filePath,
          line: atLine,
        });
        return true;
      }
      return false;
    }

    const found = resolveTaint(
      decl.initializerText,
      decl.line,
      statements,
      decl.index,
      depth - 1,
      steps,
      filePath,
    );
    if (found) {
      // Skip a redundant passthrough hop when the source step we just
      // pushed already sits on this exact declaration's line (e.g. `const
      // dir = req.query.dir` is both the source line and this decl's line).
      const last = steps.at(-1);
      if (!last || last.line !== decl.line) {
        steps.push({
          role: "passthrough",
          label: `${trimmed} = ${truncate(decl.initializerText)}`,
          filePath,
          line: decl.line,
        });
      }
    }
    return found;
  }

  for (const operand of extractSubExpressions(trimmed)) {
    if (operand === trimmed) continue;
    if (
      resolveTaint(
        operand,
        atLine,
        statements,
        beforeIndex,
        depth - 1,
        steps,
        filePath,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the nearest preceding `if` statement, before `sinkIndex`, that (a)
 * textually references `taintedIdentifier` in its condition and (b) is an
 * early-exit guard (its consequent contains a return/throw) — the
 * `if (!isSafe(x)) { return; }` idiom. Resolves the callee's own function
 * body (searched in the same file) as the guard's source snippet, per
 * docs/DETECTION-ENGINE-SPEC.md §A.3: real reachability analysis on the
 * guard's own body, not a keyword match against the guard's name.
 */
function findGuardSnippetBeforeSink(
  root: Parser.SyntaxNode,
  statements: readonly Parser.SyntaxNode[],
  taintedIdentifier: string,
  sinkIndex: number,
): string {
  if (!SIMPLE_IDENTIFIER_RE.test(taintedIdentifier)) return "";

  for (let i = sinkIndex - 1; i >= 0; i -= 1) {
    const stmt = statements[i]!;
    if (stmt.type !== "if_statement") continue;

    const condition = stmt.childForFieldName("condition");
    if (!condition) continue;
    const conditionText = condition.text;
    if (!new RegExp(`\\b${taintedIdentifier}\\b`).test(conditionText)) continue;

    const consequence = stmt.childForFieldName("consequence");
    const hasEarlyExit = consequence
      ? /\breturn\b|\bthrow\b/.test(consequence.text)
      : false;
    if (!hasEarlyExit) continue;

    const calleeMatch = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/.exec(conditionText);
    const calleeName = calleeMatch?.[1];
    const guardBody = calleeName
      ? findFunctionBodyByName(root, calleeName)
      : null;
    return guardBody ?? conditionText;
  }

  return "";
}

function findFunctionBodyByName(
  root: Parser.SyntaxNode,
  name: string,
): string | null {
  for (const fn of root.descendantsOfType([
    "function_declaration",
    "generator_function_declaration",
  ])) {
    const nameNode = fn.childForFieldName("name");
    if (nameNode?.text === name) return fn.text;
  }

  for (const decl of root.descendantsOfType([
    "lexical_declaration",
    "variable_declaration",
  ])) {
    for (const declarator of decl.namedChildren) {
      if (declarator.type !== "variable_declarator") continue;
      const nameNode = declarator.childForFieldName("name");
      const valueNode = declarator.childForFieldName("value");
      if (
        nameNode?.text === name &&
        valueNode &&
        (valueNode.type === "arrow_function" ||
          valueNode.type === "function_expression")
      ) {
        return decl.text;
      }
    }
  }

  return null;
}

export interface BuildCandidatePathsParams {
  readonly filePath: string;
  readonly sourceCode: string;
  readonly binding: SinkRuleBinding;
  readonly matches: readonly AstGrepMatch[];
}

/**
 * Turns ast-grep candidate matches for one sink rule into real
 * source -> ... -> sink CandidatePaths, by tracing the tainted argument
 * backward through the enclosing function via web-tree-sitter. Per
 * docs/DETECTION-ENGINE-SPEC.md §A.0's Yamaguchi et al. rationale, an
 * ast-grep match alone is only ever a *candidate* — a match that can't be
 * traced back to a known source within MAX_TRACE_DEPTH hops is dropped
 * entirely (not emitted as a needs-verification Finding), since it isn't a
 * real taint candidate at all.
 */
export async function buildCandidatePaths(
  params: BuildCandidatePathsParams,
): Promise<CandidatePath[]> {
  const { filePath, sourceCode, binding, matches } = params;
  if (matches.length === 0) return [];

  const languageId =
    filePath.endsWith(".js") || filePath.endsWith(".jsx")
      ? "javascript"
      : "typescript";
  const tree = await parseWithCache(filePath, sourceCode, languageId);
  const root = tree.rootNode;

  const paths: CandidatePath[] = [];

  for (const match of matches) {
    const taintedText = match.captures[binding.taintedCapture];
    if (!taintedText) continue;

    const sinkRow0 = match.startLine - 1;
    const body = findEnclosingFunctionBody(root, sinkRow0);
    const statements = body ? body.namedChildren : [];
    const sinkIndex = body
      ? findStatementIndexForRow(statements, sinkRow0)
      : -1;
    const searchBeforeIndex = sinkIndex >= 0 ? sinkIndex : statements.length;

    const steps: TaintStep[] = [];
    const traced = resolveTaint(
      taintedText,
      match.startLine,
      statements,
      searchBeforeIndex,
      MAX_TRACE_DEPTH,
      steps,
      filePath,
    );
    if (!traced) continue;

    steps.push({
      role: "sink",
      label: truncate(match.matchText),
      filePath,
      line: match.startLine,
    });

    const guardSourceSnippet =
      sinkIndex >= 0
        ? findGuardSnippetBeforeSink(
            root,
            statements,
            taintedText.trim(),
            sinkIndex,
          )
        : "";

    paths.push({
      id: `${filePath}:${match.startLine}:${binding.ruleId}`,
      sinkClass: binding.sinkClass,
      steps,
      guardSourceSnippet,
    });
  }

  return paths;
}
