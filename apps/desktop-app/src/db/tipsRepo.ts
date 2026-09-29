import type { SecurityTip } from "@whoami/types";

export const SECURITY_TIPS: readonly SecurityTip[] = [
  {
    id: "tip-cmd-injection",
    category: "Security Hygiene",
    title: "Avoid Shell Interpolation in child_process",
    summary:
      "Never pass untrusted user input directly into exec() or execSync(). Use execFile() or spawn() with arguments as an isolated array to prevent shell meta-character injection.",
    codeSnippet: `// ❌ Vulnerable (shell injection)\nchild_process.exec("ping -c 1 " + req.query.host);\n\n// ✅ Secure (argument vector)\nchild_process.execFile("ping", ["-c", "1", req.query.host]);`,
    cwe: "CWE-78",
  },
  {
    id: "tip-sql-injection",
    category: "Security Hygiene",
    title: "Use Parameterized Queries for Database Calls",
    summary:
      "String concatenation or template literals in database queries allow attackers to manipulate query logic. Always bind inputs via parameterized query placeholders ($1, ?, :param).",
    codeSnippet: `// ❌ Vulnerable (raw concat)\ndb.query(\`SELECT * FROM users WHERE id = \${userId}\`);\n\n// ✅ Secure (parameterized binding)\ndb.query("SELECT * FROM users WHERE id = $1", [userId]);`,
    cwe: "CWE-89",
  },
  {
    id: "tip-ssrf",
    category: "Security Hygiene",
    title: "Constrain Outbound HTTP Requests (SSRF)",
    summary:
      "Unrestricted fetch() or axios calls using user-supplied URLs can allow internal infrastructure scanning or cloud credential theft (e.g. AWS 169.254.169.254). Validate protocols, restrict DNS resolution, and disallow private IP ranges.",
    codeSnippet: `// ❌ Vulnerable SSRF\nawait fetch(req.body.targetUrl);\n\n// ✅ Secure (validated domain whitelist)\nconst parsed = new URL(req.body.targetUrl);\nif (ALLOWED_HOSTS.has(parsed.hostname)) {\n  await fetch(parsed.toString());\n}`,
    cwe: "CWE-918",
  },
  {
    id: "tip-ast-taint",
    category: "AST & Taint",
    title: "Understanding Deterministic Taint Flow",
    summary:
      "WhoAmI tracks data from Untrusted Sources (req.query, req.body, process.env) along Variable Declarations and Function Calls until reaching Dangerous Sinks. An intermediary sanitizer step is evaluated deterministically.",
  },
  {
    id: "tip-shortcuts",
    category: "Shortcuts",
    title: "Essential Keyboard Navigation",
    summary:
      "• Cmd/Ctrl + K: Quick Search Command Palette\n• Cmd/Ctrl + B: Toggle Issues Sidebar\n• / (slash): Open Quick Search from canvas\n• Esc: Close active modal / cancel selection\n• Double click splitter: Reset panel widths",
  },
];

export function getSecurityTips(): readonly SecurityTip[] {
  return SECURITY_TIPS;
}

