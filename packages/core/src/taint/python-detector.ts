import type { Finding, SinkClass, TaintStep } from "@whoami/types";
import type Parser from "web-tree-sitter-legacy";

import { parseWithCache } from "../parser/parser-cache.js";

interface PythonRule {
  readonly id: string;
  readonly sinkClass: SinkClass;
  readonly title: string;
  readonly severity: "critical" | "high";
  readonly cwe: string;
  readonly description: string;
  readonly hint: string;
  readonly fix: string;
  readonly link: string;
  matches(callee: string, call: Parser.SyntaxNode): boolean;
}

const PYTHON_RULES: readonly PythonRule[] = [
  {
    id: "py-command-injection",
    sinkClass: "command-injection",
    title: "Command Injection via shell execution",
    severity: "critical",
    cwe: "CWE-78",
    description: "Untrusted input reaches a shell-interpreted command.",
    hint: "Pass an argument list to subprocess with shell=False; avoid os.system and shell=True.",
    fix: "subprocess.run([binary, argument], check=True)",
    link: "https://cwe.mitre.org/data/definitions/78.html",
    matches: (callee, call) =>
      callee === "os.system" ||
      ((callee === "subprocess.Popen" || callee === "subprocess.run") &&
        /\bshell\s*=\s*True\b/.test(call.text)),
  },
  {
    id: "py-sql-injection",
    sinkClass: "sql-injection",
    title: "SQL Injection via dynamic query construction",
    severity: "critical",
    cwe: "CWE-89",
    description: "Untrusted input is interpolated into a SQL query before execution.",
    hint: "Use a constant query with parameter placeholders and pass values separately.",
    fix: 'cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))',
    link: "https://cwe.mitre.org/data/definitions/89.html",
    matches: (callee) => callee.endsWith(".execute"),
  },
  {
    id: "py-ssrf",
    sinkClass: "ssrf",
    title: "Server-Side Request Forgery (SSRF)",
    severity: "high",
    cwe: "CWE-918",
    description: "Untrusted input reaches an outbound HTTP request URL.",
    hint: "Validate the URL scheme and resolved host against an explicit allowlist before making the request.",
    fix: "validate_url(user_url)\nrequests.get(user_url)",
    link: "https://cwe.mitre.org/data/definitions/918.html",
    matches: (callee) =>
      /^(?:requests|httpx)\.(?:get|post|put|patch|delete|request)$/.test(callee),
  },
  {
    id: "py-path-traversal",
    sinkClass: "path-traversal",
    title: "Path Traversal via file access",
    severity: "high",
    cwe: "CWE-22",
    description: "Untrusted input reaches a file-open operation without a verified path boundary.",
    hint: "Resolve the path and verify it remains under the intended root before opening it.",
    fix: "safe_path = resolve_under_root(root, user_path)\nwith open(safe_path) as file:",
    link: "https://cwe.mitre.org/data/definitions/22.html",
    matches: (callee) => callee === "open" || callee.endsWith(".open"),
  },
  {
    id: "py-code-injection",
    sinkClass: "code-injection",
    title: "Code Injection via dynamic execution",
    severity: "critical",
    cwe: "CWE-95",
    description: "Untrusted input reaches Python dynamic code execution or unsafe deserialization.",
    hint: "Avoid eval/exec and never deserialize untrusted data with pickle.",
    fix: "parsed_value = json.loads(untrusted_text)",
    link: "https://cwe.mitre.org/data/definitions/95.html",
    matches: (callee) => ["eval", "exec", "pickle.loads"].includes(callee),
  },
];

const REQUEST_SOURCE_RE = /\b(?:request|req)\.(?:args|form|json|query_params|path_params|headers|GET|POST|data|values)\b/;
const IDENTIFIER_RE = /^[A-Za-z_]\w*$/;

interface TaintContext {
  readonly functionNode?: Parser.SyntaxNode;
  readonly blockNode?: Parser.SyntaxNode;
  readonly sinkNode: Parser.SyntaxNode;
}

function childByFieldOrIndex(
  node: Parser.SyntaxNode,
  field: string,
  index: number,
): Parser.SyntaxNode | undefined {
  return node.childForFieldName(field) ?? node.namedChildren[index];
}

function findAncestor(
  node: Parser.SyntaxNode,
  type: string,
): Parser.SyntaxNode | undefined {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === type) return current;
    current = current.parent;
  }
  return undefined;
}

function getContext(sinkNode: Parser.SyntaxNode): TaintContext {
  const functionNode = findAncestor(sinkNode, "function_definition");
  const blockNode = functionNode
    ? childByFieldOrIndex(functionNode, "body", functionNode.namedChildren.length - 1)
    : undefined;
  return {
    ...(functionNode ? { functionNode } : {}),
    ...(blockNode?.type === "block" ? { blockNode } : {}),
    sinkNode,
  };
}

function statementInBlock(
  node: Parser.SyntaxNode,
  block: Parser.SyntaxNode,
): Parser.SyntaxNode | undefined {
  let current: Parser.SyntaxNode | null = node;
  while (current?.parent && current.parent.id !== block.id) {
    current = current.parent;
  }
  return current?.parent?.id === block.id ? current : undefined;
}

function collectAssignments(
  node: Parser.SyntaxNode,
  name: string,
  results: Parser.SyntaxNode[],
): void {
  if (node.type === "function_definition" || node.type === "lambda") return;
  if (node.type === "assignment") {
    const left = node.namedChildren[0];
    const right = node.namedChildren[1];
    if (left?.type === "identifier" && left.text === name && right) {
      results.push(right);
    }
  }
  for (const child of node.namedChildren) collectAssignments(child, name, results);
}

function findPriorAssignment(
  name: string,
  context: TaintContext,
): Parser.SyntaxNode | undefined {
  const block = context.blockNode;
  if (!block) return undefined;
  const sinkStatement = statementInBlock(context.sinkNode, block);
  const sinkIndex = sinkStatement
    ? block.namedChildren.findIndex((statement) => statement.id === sinkStatement.id)
    : block.namedChildren.length;

  for (let index = sinkIndex - 1; index >= 0; index -= 1) {
    const statement = block.namedChildren[index];
    if (!statement) continue;
    const assignments: Parser.SyntaxNode[] = [];
    collectAssignments(statement, name, assignments);
    const right = assignments.at(-1);
    if (right) return right;
  }
  return undefined;
}

function isFunctionParameter(name: string, functionNode?: Parser.SyntaxNode): boolean {
  if (!functionNode) return false;
  const parameters = childByFieldOrIndex(functionNode, "parameters", 1);
  if (!parameters) return false;
  const names = new Set<string>();
  for (const parameter of parameters.namedChildren) {
    if (parameter.type === "identifier") names.add(parameter.text);
    else {
      const firstIdentifier = parameter.descendantsOfType("identifier")[0];
      if (firstIdentifier) names.add(firstIdentifier.text);
    }
  }
  return names.has(name);
}

function resolveTaint(
  node: Parser.SyntaxNode,
  context: TaintContext,
  depth = 8,
  visited = new Set<string>(),
): TaintStep[] {
  if (
    node.type === "string_content" ||
    node.type === "string_start" ||
    node.type === "string_end" ||
    node.type === "comment"
  ) {
    return [];
  }

  const sourceText = node.text.trim();
  // A string node's text can contain source-looking text (for example
  // "request.args" passed directly to a sink). Only inspect source text on
  // expression nodes; interpolated expressions are visited below as their
  // own AST nodes.
  const source = node.type === "string"
    ? null
    : REQUEST_SOURCE_RE.exec(sourceText);
  if (source) {
    return [{
      role: "source",
      label: sourceText.match(/^(?:request|req)\.(?:args|form|json|query_params|path_params|headers|GET|POST|data|values)/)?.[0] ?? sourceText,
      filePath: "",
      line: node.startPosition.row + 1,
    }];
  }
  if (depth <= 0) return [];

  if (node.type === "identifier" && IDENTIFIER_RE.test(node.text)) {
    if (visited.has(node.text)) return [];
    const nextVisited = new Set(visited).add(node.text);
    const assignment = findPriorAssignment(node.text, context);
    if (assignment) {
      const trace = resolveTaint(assignment, context, depth - 1, nextVisited);
      if (trace.length > 0) {
        const last = trace.at(-1);
        if (last?.line !== assignment.startPosition.row + 1) {
          trace.push({
            role: "passthrough",
            label: `${node.text} = ${assignment.text}`,
            filePath: "",
            line: assignment.startPosition.row + 1,
          });
        }
      }
      return trace;
    }
    if (isFunctionParameter(node.text, context.functionNode)) {
      return [{
        role: "source",
        label: `Function parameter: ${node.text}`,
        filePath: "",
        line: node.startPosition.row + 1,
      }];
    }
  }

  for (const child of node.namedChildren) {
    const trace = resolveTaint(child, context, depth - 1, visited);
    if (trace.length > 0) return trace;
  }
  return [];
}

function isDynamicSql(
  node: Parser.SyntaxNode,
  context: TaintContext,
  depth = 5,
): boolean {
  if (depth <= 0) return false;
  if (node.type === "string") {
    return node.namedChildren.some((child) => child.type === "interpolation");
  }
  if (node.type === "binary_operator" && /[%+]/.test(node.text)) return true;
  if (node.type === "call") {
    const callee = childByFieldOrIndex(node, "function", 0);
    if (callee && /\.format$/.test(callee.text)) return true;
  }
  if (node.type === "identifier") {
    const assignment = findPriorAssignment(node.text, context);
    return assignment ? isDynamicSql(assignment, context, depth - 1) : false;
  }
  return node.namedChildren.some((child) => isDynamicSql(child, context, depth - 1));
}

function isShlexQuoted(
  node: Parser.SyntaxNode,
  context: TaintContext,
  depth = 5,
): boolean {
  if (depth <= 0) return false;
  if (node.type === "call") {
    const callee = childByFieldOrIndex(node, "function", 0);
    if (callee?.text === "shlex.quote") return true;
  }
  if (node.type === "identifier") {
    const assignment = findPriorAssignment(node.text, context);
    return assignment ? isShlexQuoted(assignment, context, depth - 1) : false;
  }
  return node.namedChildren.some((child) => isShlexQuoted(child, context, depth - 1));
}

function callArguments(call: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const args = childByFieldOrIndex(call, "arguments", 1);
  return args?.namedChildren ?? [];
}

function positionalArguments(call: Parser.SyntaxNode): Parser.SyntaxNode[] {
  return callArguments(call).filter((argument) => argument.type !== "keyword_argument");
}

function calleeText(call: Parser.SyntaxNode): string {
  return childByFieldOrIndex(call, "function", 0)?.text.replace(/\s+/g, "") ?? "";
}

function callNodes(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const calls: Parser.SyntaxNode[] = [];
  const visit = (node: Parser.SyntaxNode): void => {
    if (node.type === "call") calls.push(node);
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return calls;
}

function pythonRuleYaml(rule: PythonRule): string {
  return `id: ${rule.id}\nlanguage: Python\nmessage: ${rule.description}\n`;
}

export async function detectPythonSecurityFindings(
  filePath: string,
  sourceCode: string,
): Promise<Finding[]> {
  const tree = await parseWithCache(filePath, sourceCode, "python");
  const findings: Finding[] = [];
  const createdAt = new Date().toISOString();

  for (const call of callNodes(tree.rootNode)) {
    const callee = calleeText(call);
    const args = positionalArguments(call);
    const input = args[0];
    if (!input) continue;
    const context = getContext(call);

    for (const rule of PYTHON_RULES) {
      if (!rule.matches(callee, call)) continue;
      if (rule.id === "py-sql-injection" && !isDynamicSql(input, context)) continue;
      if (rule.id === "py-command-injection" && isShlexQuoted(input, context)) continue;

      const sourceSteps = resolveTaint(input, context).map((step) => ({
        ...step,
        filePath,
      }));
      if (sourceSteps.length === 0) continue;

      const sinkStep: TaintStep = {
        role: "sink",
        label: call.text.replace(/\s+/g, " ").trim(),
        filePath,
        line: call.startPosition.row + 1,
      };
      findings.push({
        id: `${filePath}:${sinkStep.line}:${rule.id}`,
        ruleId: rule.id,
        status: sourceSteps[0]?.label.startsWith("Function parameter:")
          ? "needs-verification"
          : "confirmed",
        severity: rule.severity,
        title: rule.title,
        description: rule.description,
        cwe: rule.cwe,
        ruleYaml: pythonRuleYaml(rule),
        code: rule.id.replace(/^py-/, "").replace(/-/g, "_"),
        scope: "security",
        reason: `${sourceSteps[0]?.label ?? "Untrusted input"} reaches ${rule.title}.`,
        hint: rule.hint,
        fix: rule.fix,
        link: rule.link,
        trace: { steps: [...sourceSteps, sinkStep], sinkClass: rule.sinkClass },
        createdAt,
      });
      break;
    }
  }

  return findings;
}
