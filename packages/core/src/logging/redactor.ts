const SENSITIVE_KEY_REGEX =
  /(?:password|secret|token|api_?key|auth|bearer|private_?key|credential|jwt|access_?token)/i;

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub Personal Access Token
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth Token
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI / API Key
  /xox[baprs]-[0-9a-zA-Z]{10,48}/g, // Slack Token
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, // JWT
];

const REDACTED_MARKER = "[REDACTED]";

/**
 * Sanitize a string value against known high-entropy and secret patterns.
 */
export function sanitizeString(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED_MARKER);
  }
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
