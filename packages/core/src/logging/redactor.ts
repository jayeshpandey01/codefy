const SENSITIVE_KEY_REGEX =
  /(?:password|secret|token|api_?key|auth|bearer|private_?key|credential|jwt|access_?token)/i;

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /gh[pousr]_[A-Za-z0-9_]{36,}/g, // GitHub Token (Personal, OAuth, User, Server, Refresh)
  /sk-[a-zA-Z0-9_-]{20,}/g, // OpenAI / Anthropic / API Key
  /AIza[0-9A-Za-z-_]{35}/g, // Google API Key
  /[rs]k_(?:live|test)_[0-9a-zA-Z]{24,}/g, // Stripe Secret/Restricted Key
  /xox[baprs]-[0-9a-zA-Z]{10,48}/g, // Slack Token
  /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Za-z_]+\/B[0-9A-Za-z_]+\/[0-9A-Za-z_]+/g, // Slack Webhook
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, // JWT
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g, // PEM Private Key
  /(?:postgres|postgresql|mysql|mongodb|redis|amqp|mssql):\/\/[^\s:]+:[^\s@]+@[^\s/]+/gi, // DB URI with credentials
  /(?:password|passwd|secret|api_?key|auth_?token)\s*[:=]\s*["']([^"'\n]{6,})["']/gi, // Hardcoded password assignment
];

const REDACTED_MARKER = "[REDACTED]";

/**
 * Sanitize a string value against known high-entropy and secret patterns.
 */
export function sanitizeString(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, capture) => {
      // If regex captured inner secret value, redact just the inner secret
      if (typeof capture === "string") {
        return match.replace(capture, REDACTED_MARKER);
      }
      return REDACTED_MARKER;
    });
  }
  return result;
}

/**
 * Strips OS user directories and workspace base paths to prevent leaking machine identity.
 * e.g. /Users/username/Documents/project/src/auth.ts -> src/auth.ts
 */
export function maskAbsolutePaths(text: string, workspacePath?: string): string {
  let result = text;
  if (workspacePath) {
    const normalizedWs = workspacePath.replace(/\\/g, "/").replace(/\/+$/, "");
    result = result.split(normalizedWs + "/").join("");
    result = result.split(normalizedWs).join(".");
  }
  // Mask Unix/macOS user home paths: /Users/<user>/... or /home/<user>/...
  result = result.replace(/(?:\/Users|\/home)\/[a-zA-Z0-9._-]+\/(?:[^\s"'`<>]+)/g, (match) => {
    const parts = match.split("/");
    return parts.slice(Math.max(parts.length - 2, 0)).join("/");
  });
  // Mask Windows user paths: C:\Users\<user>\...
  result = result.replace(/[A-Za-z]:\\Users\\[a-zA-Z0-9._-]+\\(?:[^\s"'`<>]+)/g, (match) => {
    const parts = match.split("\\");
    return parts.slice(Math.max(parts.length - 2, 0)).join("/");
  });
  return result;
}

/**
 * Recursively redacts sensitive keys and values from an arbitrary object/array.
 * Protects against circular references.
 */
export function redactSensitiveData<T>(value: T, seen = new WeakSet()): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value) as unknown as T;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value as object)) {
    return "[Circular]" as unknown as T;
  }
  seen.add(value as object);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    } as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = REDACTED_MARKER;
    } else {
      result[key] = redactSensitiveData(val, seen);
    }
  }

  return result as T;
}
