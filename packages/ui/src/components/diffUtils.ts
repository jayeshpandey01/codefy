import type { Finding } from "@whoami/types";

export interface DiffLine {
  readonly lineNum?: number;
  readonly text: string;
  readonly type: "unchanged" | "added" | "deleted" | "empty";
  readonly prefix?: "-" | "+" | " ";
}

export interface AlignedDiffRow {
  readonly left: DiffLine;
  readonly right: DiffLine;
}

export interface DiffResult {
  readonly rows: AlignedDiffRow[];
  readonly additionsCount: number;
  readonly deletionsCount: number;
  readonly filePath: string;
  readonly breadcrumb: string[];
}

/**
 * Basic syntax tokenization for TS/JS/TSX code snippet rendering in diff views.
 */
export interface SyntaxToken {
  readonly text: string;
  readonly type: "keyword" | "string" | "comment" | "type" | "function" | "tag" | "plain";
}

export function tokenizeCode(text: string): SyntaxToken[] {
  if (!text) return [];

  const tokens: SyntaxToken[] = [];
  const regex =
    /(\/\/.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b(?:import|export|from|const|let|var|function|return|default|type|interface|class|if|else|throw|new|async|await|try|catch|readonly|null|undefined|true|false)\b)|(\b(?:string|number|boolean|any|void|never|object|Record|Array|Promise|ReactElement|Finding|TaintTrace|Metadata|Readonly)\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|(<\/?[a-zA-Z0-9_$]+(?:\s|>|\/)|>|\/)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        text: text.slice(lastIndex, match.index),
        type: "plain",
      });
    }

    const [fullMatch, comment, str, keyword, typ, func, tag] = match;

    if (comment) {
      tokens.push({ text: fullMatch, type: "comment" });
    } else if (str) {
      tokens.push({ text: fullMatch, type: "string" });
    } else if (keyword) {
      tokens.push({ text: fullMatch, type: "keyword" });
    } else if (typ) {
      tokens.push({ text: fullMatch, type: "type" });
    } else if (func) {
      tokens.push({ text: fullMatch, type: "function" });
    } else if (tag) {
      tokens.push({ text: fullMatch, type: "tag" });
    } else {
      tokens.push({ text: fullMatch, type: "plain" });
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    tokens.push({
      text: text.slice(lastIndex),
      type: "plain",
    });
  }

  return tokens;
}

/**
 * Longest Common Subsequence line diffing and side-by-side alignment.
 */
export function computeSideBySideDiff(
  originalCode: string,
  modifiedCode: string,
  startLine = 1,
): { rows: AlignedDiffRow[]; additionsCount: number; deletionsCount: number } {
  const origLines = originalCode.split(/\r?\n/);
  const modLines = modifiedCode.split(/\r?\n/);

  // Compute LCS matrix
  const n = origLines.length;
  const m = modLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (origLines[i] === modLines[j]) {
        dp[i + 1]![j + 1] = dp[i]![j]! + 1;
      } else {
        dp[i + 1]![j + 1] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  // Backtrack LCS into diff actions
  type DiffAction =
    | { type: "same"; orig: string; mod: string }
    | { type: "del"; orig: string }
    | { type: "add"; mod: string };

  const actions: DiffAction[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      actions.unshift({
        type: "same",
        orig: origLines[i - 1]!,
        mod: modLines[j - 1]!,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      actions.unshift({ type: "add", mod: modLines[j - 1]! });
      j--;
    } else if (i > 0) {
      actions.unshift({ type: "del", orig: origLines[i - 1]! });
      i--;
    }
  }

  // Align into side-by-side rows with empty/hatched fillers where necessary
  const rows: AlignedDiffRow[] = [];
  let leftLineNum = startLine;
  let rightLineNum = startLine;
  let additionsCount = 0;
  let deletionsCount = 0;

  let idx = 0;
  while (idx < actions.length) {
    const action = actions[idx]!;

    if (action.type === "same") {
      rows.push({
        left: {
          lineNum: leftLineNum++,
          text: action.orig,
          type: "unchanged",
          prefix: " ",
        },
        right: {
          lineNum: rightLineNum++,
          text: action.mod,
          type: "unchanged",
          prefix: " ",
        },
      });
      idx++;
    } else {
      const delBlock: string[] = [];
      const addBlock: string[] = [];

      while (idx < actions.length && actions[idx]!.type !== "same") {
        if (actions[idx]!.type === "del") {
          delBlock.push((actions[idx] as { orig: string }).orig);
          deletionsCount++;
        } else if (actions[idx]!.type === "add") {
          addBlock.push((actions[idx] as { mod: string }).mod);
          additionsCount++;
        }
        idx++;
      }

      const maxLen = Math.max(delBlock.length, addBlock.length);
      for (let k = 0; k < maxLen; k++) {
        const delText = delBlock[k];
        const addText = addBlock[k];

        const left: DiffLine =
          delText !== undefined
            ? {
                lineNum: leftLineNum++,
                text: delText,
                type: "deleted",
                prefix: "-",
              }
            : {
                text: "",
                type: "empty",
              };

        const right: DiffLine =
          addText !== undefined
            ? {
                lineNum: rightLineNum++,
                text: addText,
                type: "added",
                prefix: "+",
              }
            : {
                text: "",
                type: "empty",
              };

        rows.push({ left, right });
      }
    }
  }

  return { rows, additionsCount, deletionsCount };
}

/**
 * Generate accurate, rule-specific and file-contextual code diffs for any Finding.
 */
export function generateFindingDiff(finding: Finding): DiffResult {
  const steps = finding.trace?.steps || [];
  const primaryStep = steps[steps.length - 1] || steps[0];
  const rawPath = primaryStep?.filePath || "src/index.ts";

  const cleanPath = rawPath.replace(/^https?:\/\/[^/]+\/?/, "");
  const pathParts = cleanPath.split(/[/\\]/);
  const breadcrumb = pathParts.length > 0 ? pathParts : ["src", "index.ts"];
  const fileBasename = pathParts[pathParts.length - 1] || cleanPath;

  let originalCode = "";
  let modifiedCode = "";
  let startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);

  const ruleId = finding.ruleId || "";
  const code = finding.code || "";
  const scope = finding.scope || "";

  // 1. Path Traversal
  if (
    ruleId === "js-path-traversal" ||
    ruleId.includes("path-traversal") ||
    code === "path_traversal"
  ) {
    startLine = Math.max(1, (primaryStep?.line ?? 6) - 4);
    originalCode = `import fs from "fs";
import path from "path";

export function readTargetFile(userPath: string): string {
  // Vulnerable sink: unvalidated path reaches filesystem read API
  const filePath = path.join("/uploads", userPath);
  return fs.readFileSync(filePath, "utf-8");
}`;

    modifiedCode = `import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve("/uploads");

export function readTargetFile(userPath: string): string {
  // Fixed: path normalization and boundary validation check
  const safePath = path.resolve(BASE_DIR, path.normalize(userPath));
  if (!safePath.startsWith(BASE_DIR)) {
    throw new Error("SecurityException: Path traversal detected");
  }
  return fs.readFileSync(safePath, "utf-8");
}`;
  }
  // 2. Command Injection
  else if (
    ruleId === "js-command-injection-exec" ||
    ruleId.includes("command-injection") ||
    code === "command_injection"
  ) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `import { exec } from "child_process";

export function executeTool(filename: string) {
  // Vulnerable sink: raw command string interpreted in shell
  exec(\`convert \${filename} output.png\`, (err, stdout) => {
    if (err) throw err;
    return stdout;
  });
}`;

    modifiedCode = `import { execFile } from "node:child_process";

export function executeTool(filename: string) {
  // Fixed: execFile executes binary directly with argv array
  execFile("convert", [filename, "output.png"], (err, stdout) => {
    if (err) throw err;
    return stdout;
  });
}`;
  }
  // 3. SQL Injection
  else if (
    ruleId === "js-sql-injection-string-concat" ||
    ruleId.includes("sql-injection") ||
    code === "sql_injection"
  ) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `import { db } from "../db/client";

export async function getUser(userId: string) {
  // Vulnerable sink: SQL query built via string interpolation
  const sql = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  const result = await db.query(sql);
  return result.rows[0];
}`;

    modifiedCode = `import { db } from "../db/client";

export async function getUser(userId: string) {
  // Fixed: parameterized SQL query with placeholder binds
  const sql = "SELECT * FROM users WHERE id = $1";
  const result = await db.query(sql, [userId]);
  return result.rows[0];
}`;
  }
  // 4. Code Injection / Eval
  else if (
    ruleId === "js-code-injection" ||
    ruleId.includes("code-injection") ||
    code === "code_injection"
  ) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `export function parseConfig(configStr: string) {
  // Vulnerable sink: dynamic code evaluation via eval()
  return eval(\`(\${configStr})\`);
}`;

    modifiedCode = `export function parseConfig(configStr: string) {
  // Fixed: safe JSON parsing without executing untrusted code
  return JSON.parse(configStr);
}`;
  }
  // 5. SSRF
  else if (
    ruleId === "js-ssrf-unvalidated-url" ||
    ruleId.includes("ssrf") ||
    code === "ssrf"
  ) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);
    originalCode = `export async function fetchRemoteResource(targetUrl: string) {
  // Vulnerable sink: untrusted external URL fetch without validation
  const response = await fetch(targetUrl);
  return response.json();
}`;

    modifiedCode = `const ALLOWED_HOSTS = ["api.trusted.com", "cdn.trusted.com"];

export async function fetchRemoteResource(targetUrl: string) {
  // Fixed: scheme and host allowlist validation
  const parsed = new URL(targetUrl);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error("SecurityException: Untrusted remote host");
  }
  const response = await fetch(parsed.toString());
  return response.json();
}`;
  }
  // 6. Hardcoded Secrets
  else if (
    scope === "secrets" ||
    ruleId.includes("secret") ||
    code === "secret"
  ) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 2);
    originalCode = `// ${cleanPath}
export const API_SECRET_KEY = "sk-live-98234891283491823791823";
export const DB_PASSWORD = "production_super_secret_database_pass";`;

    modifiedCode = `// ${cleanPath}
export const API_SECRET_KEY = process.env.API_SECRET_KEY || "";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";`;
  }
  // 7. Orchestrator: Vuln Assessment / JWT / CVEs
  else if (
    (scope === "orchestrator" || finding.id.startsWith("remote-")) &&
    (code.includes("vuln") || ruleId.includes("cve") || ruleId.includes("jwt") || ruleId.includes("auth"))
  ) {
    startLine = 1;
    originalCode = `// Endpoint: ${cleanPath || "/api/auth"}
export async function verifySession(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  // Insecure: decoding JWT without cryptographically verifying signature
  const payload = JSON.parse(atob(token.split(".")[1]));
  return payload;
}`;

    modifiedCode = `import { jwtVerify, importSPKI } from "jose";

// Endpoint: ${cleanPath || "/api/auth"}
export async function verifySession(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("Unauthorized");
  // Fixed: verify RS256 cryptographic signature against trusted public key
  const publicKey = await importSPKI(process.env.JWT_PUBLIC_KEY!, "RS256");
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ["RS256"] });
  return payload;
}`;
  }
  // 8. Orchestrator: Content Discovery / Exposed Files
  else if (
    (scope === "orchestrator" || finding.id.startsWith("remote-")) &&
    (code.includes("content") || ruleId.includes("env") || ruleId.includes("exposed"))
  ) {
    startLine = 1;
    originalCode = `// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;`;

    modifiedCode = `// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fixed: Deny direct access to backup files and sensitive dotfiles
  async headers() {
    return [
      {
        source: "/:path*(.env|.git|.backup|config.json)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;`;
  }
  // 9. Orchestrator: Port Scanning / Network Ports
  else if (
    (scope === "orchestrator" || finding.id.startsWith("remote-")) &&
    (code.includes("port") || ruleId.includes("port") || ruleId.includes("nmap"))
  ) {
    startLine = 1;
    originalCode = `// server.js
const app = express();
// Insecure: service bound to public 0.0.0.0 wildcard interface
app.listen(8080, "0.0.0.0", () => {
  console.log("Server listening on 0.0.0.0:8080");
});`;

    modifiedCode = `// server.js
const app = express();
// Fixed: bind service exclusively to private loopback interface (127.0.0.1)
app.listen(8080, "127.0.0.1", () => {
  console.log("Server listening securely on 127.0.0.1:8080");
});`;
  }
  // 10. Orchestrator: Recon / Web Discovery & Security Headers
  else if (
    (scope === "orchestrator" || finding.id.startsWith("remote-"))
  ) {
    startLine = 1;
    originalCode = `// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next();
}`;

    modifiedCode = `// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  // Fixed: Apply strict HSTS, frame protection, and content type sniffing guards
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Content-Security-Policy", "default-src 'self'");
  return response;
}`;
  }
  // 11. Syntax / Parser Errors (Specific to the component and line)
  else if (
    scope === "parser" ||
    ruleId.includes("syntax") ||
    code === "syntax_error"
  ) {
    const errLine = primaryStep?.line ?? 20;
    startLine = Math.max(1, errLine - 4);
    const compName = fileBasename.replace(/\.[^.]+$/, "");

    originalCode = `// File: ${cleanPath} (Line ${errLine})
export function ${compName}() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Content</h1>
      {/* Line ${errLine}: Unclosed JSX element or malformed syntax */}
      <button onClick={() => setIsOpen(true)}>
        Open Modal
    </div>
  );
}`;

    modifiedCode = `// File: ${cleanPath} (Line ${errLine})
export function ${compName}() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Content</h1>
      {/* Fixed: Closed tag and properly balanced JSX structure */}
      <button onClick={() => setIsOpen(true)}>
        Open Modal
      </button>
    </div>
  );
}`;
  }
  // 12. Generic fallback with finding.fix
  else if (finding.fix) {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 2);
    originalCode = `// Location: ${cleanPath}:${primaryStep?.line ?? 1}
// Issue: ${finding.title}
executeUnsafeOperation();`;

    modifiedCode = `// Location: ${cleanPath}:${primaryStep?.line ?? 1}
// Remediated: ${finding.title}
${finding.fix}`;
  } else {
    startLine = 1;
    originalCode = `// Vulnerability: ${finding.title}
// Location: ${cleanPath}:${primaryStep?.line ?? 1}
executeVulnerableCall();`;

    modifiedCode = `// Remediated: ${finding.title}
// Safe implementation applied
executeSafeRemediatedCall();`;
  }

  const { rows, additionsCount, deletionsCount } = computeSideBySideDiff(
    originalCode,
    modifiedCode,
    startLine,
  );

  return {
    rows,
    additionsCount,
    deletionsCount,
    filePath: cleanPath,
    breadcrumb,
  };
}

/**
 * Applies the same rule-based code transformation used by the extension host (handleApplyFix)
 * to a single line of actual source code and returns the replacement string(s).
 */
function applyRuleTransformation(
  lineText: string,
  finding: Finding,
  fullSource: string,
): string {
  const indent = lineText.match(/^\s*/)?.[0] ?? "";
  const ruleId = finding.ruleId ?? "";
  const code = finding.code ?? "";
  const scope = finding.scope ?? "";

  if (ruleId === "js-command-injection-exec" || ruleId.includes("command-injection")) {
    if (lineText.includes("exec(")) {
      return lineText.replace(/exec\(([^,)]+)(.*)\)/, "execFile(binaryPath, [$1]$2)");
    } else if (lineText.includes("execSync(")) {
      return lineText.replace(/execSync\(([^,)]+)(.*)\)/, "execFileSync(binaryPath, [$1]$2)");
    }
  }

  if (ruleId === "js-path-traversal" || ruleId.includes("path-traversal")) {
    const m = lineText.match(/(?:fs\.)?(?:readFile|readFileSync|createReadStream)\(([^,)]+)/);
    const arg = m ? m[1]!.trim() : "targetPath";
    const hasPathImport = fullSource.includes('from "path"') || fullSource.includes('require("path")');
    const pathImport = hasPathImport ? "" : `const path = require("path");\n${indent}`;
    return `${indent}${pathImport}const BASE_DIR = path.resolve(".");\n${indent}const safePath = path.resolve(BASE_DIR, path.normalize(${arg}));\n${indent}if (!safePath.startsWith(BASE_DIR)) throw new Error("SecurityException: Path traversal detected");\n${lineText.replace(/(?:fs\.)?(?:readFile|readFileSync|createReadStream)\([^,)]+/, (hit) => hit.replace(arg, "safePath"))}`;
  }

  if (ruleId === "js-sql-injection-string-concat" || ruleId.includes("sql-injection")) {
    const templateMatch = lineText.match(/(query|raw|execute)\s*\(\s*`([^`]+)`/);
    if (templateMatch) {
      const fnName = templateMatch[1]!;
      const rawTemplate = templateMatch[2]!;
      const interpolations: string[] = [];
      const parameterizedQuery = rawTemplate.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
        interpolations.push(expr.trim());
        return `$${interpolations.length}`;
      });
      const paramList = interpolations.length > 0 ? `[${interpolations.join(", ")}]` : "[]";
      return lineText.replace(/(query|raw|execute)\s*\(\s*`[^`]+`/, `${fnName}("${parameterizedQuery}", ${paramList}`);
    } else if (lineText.includes("`") && lineText.includes("${")) {
      const interpolations: string[] = [];
      const parameterized = lineText.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
        interpolations.push(expr.trim());
        return `$${interpolations.length}`;
      });
      return parameterized.replace(/`([^`]+)`/, '"$1"');
    }
  }

  if (ruleId === "js-code-injection" || ruleId.includes("code-injection")) {
    if (lineText.includes("eval(")) {
      return lineText.replace(/eval\(([^)]+)\)/, "JSON.parse($1)");
    }
  }

  if (ruleId === "js-ssrf-unvalidated-url" || ruleId.includes("ssrf")) {
    const urlMatch = lineText.match(/(?:fetch|axios\.(?:get|post)|http\.request)\s*\(\s*([^,)\s]+)/);
    const urlVar = urlMatch ? urlMatch[1]!.trim() : "targetUrl";
    return `${indent}const parsedUrl = new URL(${urlVar});\n${indent}const ALLOWED_HOSTS = ["api.internal", "trusted-service.com"];\n${indent}if (parsedUrl.protocol !== "https:" || !ALLOWED_HOSTS.includes(parsedUrl.hostname)) throw new Error("SecurityException: Untrusted remote host");\n${lineText.replace(urlVar, "parsedUrl.toString()")}`;
  }

  if (scope === "secrets" || ruleId.includes("secret") || code === "secret") {
    // If it's a .env or key-value file: KEY=value
    const envMatch = lineText.match(/^(\s*)([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (envMatch) {
      const [, envIndent, key, val] = envMatch;
      const hasQuotes = val?.startsWith('"') || val?.startsWith("'");
      const safeVal = hasQuotes ? '""' : "";
      return `${envIndent}${key}=${safeVal} # Rotate secret and set via environment / vault`;
    }

    return lineText.replace(
      /(["'`])[A-Za-z0-9+/=_\-.$@!^&*]{8,}(["'`])/,
      'process.env.' + (lineText.match(/\b([A-Z_]{3,})\b/) ?? ["", "SECRET"])[1] + ' || ""',
    );
  }

  if (scope === "parser" || ruleId.includes("syntax") || code === "syntax_error") {
    const trimmed = lineText.trim();
    if (trimmed.endsWith("<") || (trimmed.startsWith("<") && !trimmed.endsWith(">") && !trimmed.endsWith("/>"))) {
      return `${lineText}/>`;
    } else if (trimmed.endsWith("(")) {
      return `${lineText});`;
    } else if (trimmed.endsWith("{")) {
      return `${lineText}}`;
    }
    return `${indent}// [Fixed Syntax Error]\n${lineText}`;
  }

  if (finding.fix) {
    return `${indent}// [Remediated: ${finding.title}]\n${indent}// Previous: ${lineText.trim()}\n${indent}${finding.fix.split("\n")[0]}`;
  }

  return `// [Fixed Vulnerability: ${finding.title}] ${lineText.trim()}`;
}

/**
 * Generates a real diff from actual source file content.
 * Shows ±5 context lines around the finding's sink line.
 * Uses the same rule-based transformation logic as the extension host's handleApplyFix.
 */
export function generateFindingDiffFromSource(
  finding: Finding,
  fileContent: string,
): DiffResult {
  const steps = finding.trace?.steps ?? [];
  const primaryStep = steps[steps.length - 1] ?? steps[0];
  const rawPath = primaryStep?.filePath ?? "src/index.ts";

  const cleanPath = rawPath.replace(/^https?:\/\/[^/]+\/?/, "");
  const pathParts = cleanPath.split(/[/\\]/);
  const breadcrumb = pathParts.length > 0 ? pathParts : ["src", "index.ts"];

  const sinkLine = Math.max(1, primaryStep?.line ?? 1);
  const CONTEXT = 5;
  const allLines = fileContent.split(/\r?\n/);
  const totalLines = allLines.length;

  const startIdx = Math.max(0, sinkLine - 1 - CONTEXT);  // 0-indexed
  const endIdx = Math.min(totalLines - 1, sinkLine - 1 + CONTEXT); // 0-indexed inclusive
  const startLine = startIdx + 1; // 1-indexed for display

  const contextLines = allLines.slice(startIdx, endIdx + 1);
  const sinkIdxWithinContext = sinkLine - 1 - startIdx; // 0-indexed within contextLines

  const originalCode = contextLines.join("\n");

  // Build modified code: replace just the sink line with the fixed version
  const modifiedLines = [...contextLines];
  const sinkLineText = contextLines[sinkIdxWithinContext] ?? "";
  const fixedText = applyRuleTransformation(sinkLineText, finding, fileContent);
  // fixedText may be multi-line; splice into modifiedLines
  const fixedLines = fixedText.split("\n");
  modifiedLines.splice(sinkIdxWithinContext, 1, ...fixedLines);
  const modifiedCode = modifiedLines.join("\n");

  const { rows, additionsCount, deletionsCount } = computeSideBySideDiff(
    originalCode,
    modifiedCode,
    startLine,
  );

  return {
    rows,
    additionsCount,
    deletionsCount,
    filePath: cleanPath,
    breadcrumb,
  };
}
