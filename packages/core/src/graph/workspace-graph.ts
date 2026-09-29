import type {
  Finding,
  Severity,
  WorkspaceGraph,
  WorkspaceGraphEdge,
  WorkspaceGraphNode,
} from "@whoami/types";

function getBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function getDirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(0, idx) : ".";
}

function getRelativePath(rootPath: string, absFile: string): string {
  const normRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const normAbs = absFile.replace(/\\/g, "/");
  if (normAbs.startsWith(normRoot + "/")) {
    return normAbs.slice(normRoot.length + 1);
  }
  if (normAbs === normRoot) {
    return "";
  }
  return normAbs;
}

interface FileFindingSummary {
  count: number;
  highestSeverity?: Severity;
}

interface ExtractedSymbol {
  id: string;
  name: string;
  type: "function" | "class";
  line: number;
  startLine: number;
  endLine: number;
  calls: string[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function resolveHighestSeverity(
  current?: Severity,
  candidate?: Severity,
): Severity | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current]
    ? candidate
    : current;
}

const IMPORT_REGEX =
  /(?:import\s+(?:(?:[\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

// Universal multi-language symbol extraction patterns
const CLASS_REGEX =
  /(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface|struct|trait|contract|type)\s+([a-zA-Z0-9_$]+)/;
const FUNC_DECL_REGEX =
  /(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:pub\s+)?(?:func|def|fn|function)\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_$]+)/;
const ARROW_FUNC_REGEX =
  /(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/;
const KOTLIN_SWIFT_FUNC_REGEX = /(?:fun|func)\s+([a-zA-Z0-9_$]+)\s*\(/;
const CALL_REGEX = /\b([a-zA-Z0-9_$]+)\s*\(/g;

const BUILTIN_CALL_KEYWORDS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "function",
  "return",
  "require",
  "import",
  "export",
  "typeof",
  "sizeof",
  "print",
  "println",
  "console",
  "log",
  "new",
  "super",
]);

/**
 * Universal multi-language extractor for functions, classes, and calls.
 * Optimized with fast-path skips and O(1) call tracking.
 */
function extractSymbolsFromCode(
  filePath: string,
  code: string,
): ExtractedSymbol[] {
  const lines = code.split(/\r?\n/);
  const symbols: ExtractedSymbol[] = [];
  const normalizedFile = filePath.replace(/\\/g, "/");

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const lineContent = rawLine.trim();
    if (
      lineContent.length === 0 ||
      lineContent.startsWith("//") ||
      lineContent.startsWith("#") ||
      lineContent.startsWith("/*") ||
      lineContent.startsWith("*")
    ) {
      continue;
    }

    const lineNumber = i + 1;

    // Fast-path: Skip regex evaluation if the line cannot possibly declare a class or function
    const hasClassKeyword =
      lineContent.includes("class") ||
      lineContent.includes("interface") ||
      lineContent.includes("struct") ||
      lineContent.includes("trait") ||
      lineContent.includes("contract") ||
      lineContent.includes("type");

    const hasFuncIndicator =
      lineContent.includes("(") || lineContent.includes("=>");

    if (!hasClassKeyword && !hasFuncIndicator) {
      continue;
    }

    // 1. Check Class / Struct / Interface / Contract
    if (hasClassKeyword) {
      const classMatch = CLASS_REGEX.exec(lineContent);
      if (
        classMatch &&
        classMatch[1] &&
        !BUILTIN_CALL_KEYWORDS.has(classMatch[1])
      ) {
        const className = classMatch[1];
        const classId = `class:${normalizedFile}:${className}:${lineNumber}`;
        symbols.push({
          id: classId,
          name: className,
          type: "class",
          line: lineNumber,
          startLine: lineNumber,
          endLine: Math.min(lines.length, lineNumber + 50),
          calls: [],
        });
        continue;
      }
    }

    // 2. Check Function Declarations
    let funcName: string | undefined;
    const funcDeclMatch = FUNC_DECL_REGEX.exec(lineContent);
    if (funcDeclMatch && funcDeclMatch[1]) {
      funcName = funcDeclMatch[1];
    } else {
      const arrowMatch = ARROW_FUNC_REGEX.exec(lineContent);
      if (arrowMatch && arrowMatch[1]) {
        funcName = arrowMatch[1];
      } else {
        const ktSwiftMatch = KOTLIN_SWIFT_FUNC_REGEX.exec(lineContent);
        if (ktSwiftMatch && ktSwiftMatch[1]) {
          funcName = ktSwiftMatch[1];
        } else {
          const methodMatch =
            /^(?:async\s+)?(?:public\s+|private\s+|protected\s+|static\s+)*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/.exec(
              lineContent,
            );
          if (
            methodMatch &&
            methodMatch[1] &&
            !BUILTIN_CALL_KEYWORDS.has(methodMatch[1])
          ) {
            funcName = methodMatch[1];
          }
        }
      }
    }

    if (funcName && !BUILTIN_CALL_KEYWORDS.has(funcName)) {
      // Find approximate function body lines to extract calls
      const callsSet = new Set<string>();
      const bodyEnd = Math.min(lines.length, i + 35);
      for (let j = i; j < bodyEnd; j++) {
        const bodyLine = lines[j] ?? "";
        // Fast-path: if there's no open parenthesis on this line, no function call can exist
        if (!bodyLine.includes("(")) continue;

        let callMatch: RegExpExecArray | null;
        CALL_REGEX.lastIndex = 0;
        while ((callMatch = CALL_REGEX.exec(bodyLine)) !== null) {
          const callee = callMatch[1];
          if (
            callee &&
            callee !== funcName &&
            !BUILTIN_CALL_KEYWORDS.has(callee)
          ) {
            callsSet.add(callee);
          }
        }
      }

      symbols.push({
        id: `func:${normalizedFile}:${funcName}:${lineNumber}`,
        name: funcName,
        type: "function",
        line: lineNumber,
        startLine: lineNumber,
        endLine: bodyEnd,
        calls: Array.from(callsSet),
      });
    }
  }

  return symbols;
}

/**
 * Builds a clean project architecture, symbol hierarchy & dependency graph from workspace files and findings.
 */
export function buildWorkspaceGraph(
  files: readonly string[],
  findings: readonly Finding[],
  fileContents?: Map<string, string>,
  rootPath?: string,
): WorkspaceGraph {
  const nodes: WorkspaceGraphNode[] = [];
  const edges: WorkspaceGraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  const addEdge = (edge: WorkspaceGraphEdge) => {
    if (!edgeIds.has(edge.id)) {
      edgeIds.add(edge.id);
      edges.push(edge);
    }
  };

  // Pre-index files by basenameWithoutExt for O(1) import resolution
  const filesByBasename = new Map<string, string[]>();
  for (const f of files) {
    const base = getBasename(f).replace(/\.[^/.]+$/, "");
    const list = filesByBasename.get(base) ?? [];
    list.push(f);
    filesByBasename.set(base, list);
  }

  // Map findings to file lines
  const fileFindings = new Map<string, FileFindingSummary>();
  const lineFindings = new Map<
    string,
    { count: number; highestSeverity: Severity }
  >();

  for (const finding of findings) {
    for (const step of finding.trace.steps) {
      const normalizedPath = step.filePath.replace(/\\/g, "/");
      const existing = fileFindings.get(normalizedPath) ?? { count: 0 };
      existing.count += 1;
      existing.highestSeverity = resolveHighestSeverity(
        existing.highestSeverity,
        finding.severity,
      );
      fileFindings.set(normalizedPath, existing);

      // Map to exact line
      const lineKey = `${normalizedPath}:${step.line}`;
      const lineExisting = lineFindings.get(lineKey) ?? {
        count: 0,
        highestSeverity: finding.severity,
      };
      lineExisting.count += 1;
      lineExisting.highestSeverity =
        resolveHighestSeverity(
          lineExisting.highestSeverity,
          finding.severity,
        ) ?? finding.severity;
      lineFindings.set(lineKey, lineExisting);
    }
  }

  const directories = new Set<string>();
  const allSymbolsByFile = new Map<string, ExtractedSymbol[]>();
  const globalFunctionMap = new Map<string, string>(); // funcName -> funcNodeId
  const fileSymbolsMap = new Map<string, Map<string, string>>(); // absFile -> (funcName -> funcNodeId)

  // Phase 1: Extract Directory and File Nodes
  for (const absFile of files) {
    const normalizedAbs = absFile.replace(/\\/g, "/");
    const relFile = rootPath
      ? getRelativePath(rootPath, absFile)
      : getBasename(absFile);

    const dirName = getDirname(relFile);
    if (dirName && dirName !== "." && !directories.has(dirName)) {
      directories.add(dirName);
      const dirParts = dirName.split("/");
      let currentPath = "";
      for (const part of dirParts) {
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const dirId = `dir:${currentPath}`;
        if (!nodeIds.has(dirId)) {
          nodeIds.add(dirId);
          nodes.push({
            id: dirId,
            label: `📁 ${part}/`,
            type: "directory",
            filePath: currentPath,
          });

          if (parentPath) {
            addEdge({
              id: `edge:dir:${parentPath}->${dirId}`,
              source: `dir:${parentPath}`,
              target: dirId,
              type: "contains",
            });
          }
        }
      }
    }

    const fileId = `file:${normalizedAbs}`;
    if (!nodeIds.has(fileId)) {
      nodeIds.add(fileId);

      let summary = fileFindings.get(normalizedAbs);
      if (!summary) {
        for (const [findingFile, s] of fileFindings.entries()) {
          if (
            normalizedAbs.endsWith(findingFile) ||
            findingFile.endsWith(relFile)
          ) {
            summary = s;
            break;
          }
        }
      }

      nodes.push({
        id: fileId,
        label: getBasename(relFile),
        type: "file",
        filePath: absFile,
        line: 1,
        findingCount: summary?.count,
        highestSeverity: summary?.highestSeverity,
      });

      if (dirName && dirName !== ".") {
        addEdge({
          id: `edge:dir:${dirName}->${fileId}`,
          source: `dir:${dirName}`,
          target: fileId,
          type: "contains",
        });
      }
    }

    // Phase 2: Extract Symbols (Classes, Functions, Calls) from code
    if (fileContents && fileContents.has(absFile)) {
      const code = fileContents.get(absFile) ?? "";
      const symbols = extractSymbolsFromCode(absFile, code);
      allSymbolsByFile.set(absFile, symbols);

      const localMap = new Map<string, string>();
      fileSymbolsMap.set(absFile, localMap);

      for (const sym of symbols) {
        globalFunctionMap.set(sym.name, sym.id);
        localMap.set(sym.name, sym.id);

        // Check if any finding falls inside this function's line range
        let symFindingCount = 0;
        let symHighestSeverity: Severity | undefined;

        for (let l = sym.startLine; l <= sym.endLine; l++) {
          const lf = lineFindings.get(`${normalizedAbs}:${l}`);
          if (lf) {
            symFindingCount += lf.count;
            symHighestSeverity = resolveHighestSeverity(
              symHighestSeverity,
              lf.highestSeverity,
            );
          }
        }

        if (!nodeIds.has(sym.id)) {
          nodeIds.add(sym.id);
          nodes.push({
            id: sym.id,
            label: sym.type === "class" ? `🔷 ${sym.name}` : `ƒ ${sym.name}()`,
            type: sym.type,
            filePath: absFile,
            line: sym.line,
            findingCount: symFindingCount > 0 ? symFindingCount : undefined,
            highestSeverity: symHighestSeverity,
          });

          // Edge: File -> defines -> Symbol
          addEdge({
            id: `edge:defines:${fileId}->${sym.id}`,
            source: fileId,
            target: sym.id,
            type: "defines",
            label: "defines",
          });
        }
      }

      // Phase 3: Module Imports (O(1) lookup via filesByBasename)
      let match: RegExpExecArray | null;
      IMPORT_REGEX.lastIndex = 0;
      while ((match = IMPORT_REGEX.exec(code)) !== null) {
        const importSpecifier = match[1] || match[2];
        if (
          importSpecifier &&
          (importSpecifier.startsWith(".") || importSpecifier.startsWith("@/"))
        ) {
          const targetBasename = getBasename(importSpecifier).replace(
            /\.[^/.]+$/,
            "",
          );
          const candidates = filesByBasename.get(targetBasename);
          const targetFile = candidates?.find((f) => f !== absFile) ?? candidates?.[0];

          if (targetFile && targetFile !== absFile) {
            const targetId = `file:${targetFile.replace(/\\/g, "/")}`;
            addEdge({
              id: `edge:import:${fileId}->${targetId}`,
              source: fileId,
              target: targetId,
              type: "imports",
              label: "imports",
            });
          }
        }
      }
    }
  }

  // Phase 4: Function Call Connections (Function A -> calls -> Function B)
  for (const [absFile, symbols] of allSymbolsByFile.entries()) {
    const localFuncs = fileSymbolsMap.get(absFile);
    for (const sym of symbols) {
      for (const calleeName of sym.calls) {
        // First check local file scope, fallback to global map
        const targetNodeId = localFuncs?.get(calleeName) ?? globalFunctionMap.get(calleeName);
        if (targetNodeId && targetNodeId !== sym.id) {
          addEdge({
            id: `edge:call:${sym.id}->${targetNodeId}`,
            source: sym.id,
            target: targetNodeId,
            type: "calls",
            label: "calls",
          });
        }
      }
    }
  }

  return { nodes, edges };
}
