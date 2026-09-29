import type { Finding } from "@whoami/types";
import type Parser from "web-tree-sitter-legacy";

import { parseWithCache } from "./parser-cache.js";
import type { SupportedLanguageId } from "./wasm-loader.js";

interface ErrorNodeInfo {
  readonly line: number;
  readonly column: number;
  readonly text: string;
  readonly isMissing: boolean;
}

function truncate(text: string, maxLength = 40): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > maxLength
    ? `${singleLine.slice(0, maxLength)}…`
    : singleLine;
}

function collectErrorNodes(
  node: Parser.SyntaxNode,
  acc: ErrorNodeInfo[],
): void {
  const isErr = node.type === "ERROR" || node.isError || node.isMissing;

  if (isErr) {
    let hasErrorChild = false;
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (
        child &&
        (child.type === "ERROR" || child.isError || child.isMissing)
      ) {
        hasErrorChild = true;
        collectErrorNodes(child, acc);
      }
    }

    if (!hasErrorChild) {
      acc.push({
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        text: truncate(node.text),
        isMissing: node.isMissing,
      });
    }
    return;
  }

  // Recurse into children if parent has an error descendant
  if (node.hasError) {
    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      if (child) collectErrorNodes(child, acc);
    }
  }
}

/**
 * Detects syntax errors in source code across any supported language
 * using web-tree-sitter's AST error recovery nodes.
 */
export async function detectSyntaxErrors(
  filePath: string,
  sourceCode: string,
  languageId: SupportedLanguageId,
): Promise<Finding[]> {
  try {
    const tree = await parseWithCache(filePath, sourceCode, languageId);
    if (!tree.rootNode.hasError) {
      return [];
    }

    const rawErrors: ErrorNodeInfo[] = [];
    collectErrorNodes(tree.rootNode, rawErrors);

    const findings: Finding[] = [];
    const seenLines = new Set<number>();
    const createdAt = new Date().toISOString();

    for (const err of rawErrors) {
      if (seenLines.has(err.line)) continue;
      seenLines.add(err.line);

      const snippet = err.isMissing
        ? "missing required syntax token"
        : err.text
          ? `unexpected token "${err.text}"`
          : "malformed syntax";

      const syntaxRuleYaml = `id: syntax-error
language: ${languageId}
severity: error
rule:
  kind: ERROR | MISSING
message: >
  Language parser encountered unexpected token or missing syntax element.
note: |
  Parsed with tree-sitter-${languageId} grammar parser.`;

      findings.push({
        id: `${filePath}:${err.line}:syntax-error`,
        ruleId: "syntax-error",
        status: "confirmed",
        severity: "high",
        title: `Syntax Error (${languageId}) at line ${err.line}`,
        description: `Syntax error detected at line ${err.line}, column ${err.column}: ${snippet}.`,
        cwe: "Syntax-Error",
        code: "syntax_error",
        scope: "parser",
        reason: `Language parser encountered ${snippet} at line ${err.line}, column ${err.column} in ${filePath}.`,
        hint: `Inspect line ${err.line} for missing closing brackets, unmatched quotes, invalid syntax, or unsupported ${languageId} dialect features.`,
        fix: err.isMissing
          ? `// Ensure all brackets, semicolons, and tags on line ${err.line} are properly closed`
          : undefined,
        link: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors",
        ruleYaml: syntaxRuleYaml,
        trace: {
          sinkClass: "code-injection",
          steps: [
            {
              role: "sink",
              label: `Syntax Error: ${snippet}`,
              filePath,
              line: err.line,
            },
          ],
        },
        createdAt,
      });
    }

    return findings;
  } catch {
    return [];
  }
}
