import type { Finding } from "@whoami/types";

export interface FixDiffText {
  readonly originalCode: string;
  readonly modifiedCode: string;
  /** Cleaned, breadcrumb-friendly relative path (leading scheme/host stripped). */
  readonly filePath: string;
  readonly startLine: number;
}

/**
 * Produces a rule-specific, illustrative before/after code snippet for a
 * Finding's remediation. Shared by the VS Code/Tauri "Apply Fix" diff modal
 * (packages/ui/src/components/diffUtils.ts) and the Markdown report
 * generator, so both surfaces show the identical suggested fix.
 *
 * These snippets are illustrative remediation patterns keyed off
 * ruleId/code/scope, not a line-accurate diff of the actual file on disk —
 * there is no in-process access to real file content at this layer. The
 * generic fallback branch anchors on `finding.fix` (the one field that can
 * carry real generated remediation text) where available.
 */
export function generateFixDiffText(finding: Finding): FixDiffText {
  const steps = finding.trace?.steps || [];
  const primaryStep = steps[steps.length - 1] || steps[0];
  const rawPath = primaryStep?.filePath || "src/index.ts";

  const cleanPath = rawPath.replace(/^https?:\/\/[^/]+\/?/, "");
  const pathParts = cleanPath.split(/[/\\]/);
  const fileBasename = pathParts[pathParts.length - 1] || cleanPath;

  let originalCode = "";
  let modifiedCode = "";
  let startLine = Math.max(1, (primaryStep?.line ?? 5) - 3);

  const ruleId = finding.ruleId || "";
  const code = finding.code || "";
  const scope = finding.scope || "";

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
  } else if (
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
  } else if (
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
  } else if (
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
  } else if (
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
  } else if (scope === "secrets" || ruleId.includes("secret") || code === "secret") {
    startLine = Math.max(1, (primaryStep?.line ?? 5) - 2);
    originalCode = `// ${cleanPath}
export const API_SECRET_KEY = "sk-live-98234891283491823791823";
export const DB_PASSWORD = "production_super_secret_database_pass";`;

    modifiedCode = `// ${cleanPath}
export const API_SECRET_KEY = process.env.API_SECRET_KEY || "";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";`;
  } else if (
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
  } else if (
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
  } else if (
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
  } else if (scope === "orchestrator" || finding.id.startsWith("remote-")) {
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
  } else if (scope === "parser" || ruleId.includes("syntax") || code === "syntax_error") {
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
  } else if (finding.fix) {
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

  return { originalCode, modifiedCode, filePath: cleanPath, startLine };
}

/**
 * Minimal LCS-based unified diff (space/`-`/`+` prefixed lines) between two
 * code snippets -- used to render `generateFixDiffText`'s output as a
 * `diff`-fenced Markdown block. Not a general-purpose diff library: sized
 * for the short illustrative snippets this module produces.
 */
export function generateUnifiedDiff(original: string, modified: string): string {
  const a = original.split(/\r?\n/);
  const b = modified.split(/\r?\n/);
  const n = a.length;
  const m = b.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      lines.push(`-${a[i]}`);
      i++;
    } else {
      lines.push(`+${b[j]}`);
      j++;
    }
  }
  while (i < n) {
    lines.push(`-${a[i]}`);
    i++;
  }
  while (j < m) {
    lines.push(`+${b[j]}`);
    j++;
  }

  return lines.join("\n");
}
