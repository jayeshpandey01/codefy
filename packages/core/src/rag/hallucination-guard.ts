/**
 * Neuro-Symbolic Post-Generation Verification Guard
 *
 * Grounded in:
 * - "LLMSAN: Sanitizing Large Language Models in Bug Detection with Data-Flow" (ACL 2024)
 * - "CodeMirage: Hallucination Benchmarks and Mitigations for Code LLMs" (2024)
 *
 * Intercepts LLM generated responses and validates factual claims deterministically
 * against the Code Property Graph (WorkspaceGraph) and active scan findings.
 */

import type { Finding, WorkspaceGraph } from "@whoami/types";
import { sanitizeString } from "../logging/redactor.js";

export type ViolationType =
  | "HALLUCINATED_FINDING"
  | "HALLUCINATED_FILE"
  | "INVALID_EDGE"
  | "SYNTAX_ERROR"
  | "SECRET_LEAKAGE";

export interface VerificationViolation {
  readonly type: ViolationType;
  readonly message: string;
  readonly entity?: string;
}

export interface VerificationResult {
  readonly isValid: boolean;
  readonly violations: readonly VerificationViolation[];
  readonly sanitizedText: string;
}

export interface GuardContext {
  readonly findings: readonly Finding[];
  readonly graph?: WorkspaceGraph;
}

/**
 * Checks for balanced brackets and quotes in code blocks.
 */
function validateSyntaxDelimiters(code: string): boolean {
  const stack: string[] = [];
  const matching: Record<string, string> = {
    "}": "{",
    ")": "(",
    "]": "[",
  };

  let inString = false;
  let stringChar = "";

  for (let i = 0; i < code.length; i++) {
    const char = code[i];

    // Simple quote skipping
    if ((char === '"' || char === "'" || char === "`") && code[i - 1] !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "(" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === ")" || char === "]") {
      if (stack.length === 0 || stack.pop() !== matching[char]) {
        return false;
      }
    }
  }

  return stack.length === 0;
}

/**
 * Deterministically checks LLM response text against active scan facts and graph topology.
 */
export function verifyLlmResponse(
  llmText: string,
  context: GuardContext,
): VerificationResult {
  const violations: VerificationViolation[] = [];

  // 1. Secret Leakage Sanitization
  const sanitizedText = sanitizeString(llmText);
  if (sanitizedText !== llmText) {
    violations.push({
      type: "SECRET_LEAKAGE",
      message: "Detected and redacted credential or token in generated response.",
    });
  }

  // 2. Validate Cited Finding IDs
  const findingIdPattern = /\b(?:F-\d+|remote-[a-z0-9-]+)\b/gi;
  const citedFindingIds = Array.from(new Set((llmText.match(findingIdPattern) ?? []).map((m) => m.toUpperCase())));
  const validFindingIds = new Set(context.findings.map((f) => f.id.toUpperCase()));

  for (const citedId of citedFindingIds) {
    if (!validFindingIds.has(citedId)) {
      violations.push({
        type: "HALLUCINATED_FINDING",
        message: `Cited finding ID "${citedId}" does not exist in the active scan repository.`,
        entity: citedId,
      });
    }
  }

  // 3. Validate Cited File Paths
  if (context.graph || context.findings.length > 0) {
    const filePathPattern = /\b[\w/.-]+\.(?:ts|tsx|js|jsx|py|go|java|c|cpp|rs|json|yaml|yml)\b/gi;
    const citedFiles = Array.from(new Set((llmText.match(filePathPattern) ?? []).map((m) => m.toLowerCase())));

    const knownFiles = new Set<string>();
    if (context.graph) {
      for (const node of context.graph.nodes) {
        if (node.type === "file" && node.filePath) {
          knownFiles.add(node.filePath.toLowerCase());
          const baseName = node.filePath.split(/[/\\]/).pop()?.toLowerCase();
          if (baseName) knownFiles.add(baseName);
        }
      }
    }
    for (const f of context.findings) {
      if (f.trace?.steps) {
        for (const step of f.trace.steps) {
          if (step.filePath) {
            knownFiles.add(step.filePath.toLowerCase());
            const baseName = step.filePath.split(/[/\\]/).pop()?.toLowerCase();
            if (baseName) knownFiles.add(baseName);
          }
        }
      }
    }

    for (const file of citedFiles) {
      // Ignore common mock or standard config files
      if (
        file === "package.json" ||
        file === "tsconfig.json" ||
        file.endsWith(".config.js") ||
        file.endsWith(".config.ts")
      ) {
        continue;
      }

      const isKnown =
        knownFiles.has(file) ||
        Array.from(knownFiles).some((kf) => kf.endsWith(file) || file.endsWith(kf));

      if (knownFiles.size > 0 && !isKnown) {
        violations.push({
          type: "HALLUCINATED_FILE",
          message: `Cited file path "${file}" was not found in the codebase graph or findings.`,
          entity: file,
        });
      }
    }
  }

  // 4. Validate Code Block Syntax Integrity
  const codeBlockPattern = /```(?:[\w-]+)?\n([\s\S]*?)```/g;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = codeBlockPattern.exec(llmText)) !== null) {
    const codeSnippet = codeMatch[1] ?? "";
    if (codeSnippet && !validateSyntaxDelimiters(codeSnippet)) {
      violations.push({
        type: "SYNTAX_ERROR",
        message: "Code replacement block contains unclosed or mismatched syntax brackets.",
      });
      break;
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
    sanitizedText,
  };
}
