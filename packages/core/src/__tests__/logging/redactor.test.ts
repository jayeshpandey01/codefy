import { describe, expect, it } from "vitest";
import { maskAbsolutePaths, redactSensitiveData, sanitizeString } from "../../logging/redactor.js";

describe("redactor & sanitizer", () => {
  it("sanitizes AWS access keys and tokens from strings", () => {
    const raw = "Found leaked key AKIAIOSFODNN7EXAMPLE in config";
    const sanitized = sanitizeString(raw);
    expect(sanitized).toBe("Found leaked key [REDACTED] in config");
  });

  it("sanitizes GitHub and OpenAI tokens from strings", () => {
    const gh = "token: ghp_1234567890abcdefghijklmnopqrstuvwxyz";
    expect(sanitizeString(gh)).toBe("token: [REDACTED]");

    const oa = "sk-abcdefghijklmnopqrstuvwxyz123456";
    expect(sanitizeString(oa)).toBe("[REDACTED]");
  });

  it("redacts sensitive object keys automatically", () => {
    const data = {
      user: "alice",
      password: "SuperSecretPassword123!",
      apiKey: "key_12345",
      bearer_token: "xyz",
      nested: {
        privateKey: "SECRET_PEM",
        safeField: "visible",
      },
    };

    const redacted = redactSensitiveData(data);
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.bearer_token).toBe("[REDACTED]");
    expect(redacted.nested.privateKey).toBe("[REDACTED]");
    expect(redacted.nested.safeField).toBe("visible");
    expect(redacted.user).toBe("alice");
  });

  it("safely handles circular object references without crashing", () => {
    const circular: Record<string, unknown> = { name: "root" };
    circular["self"] = circular;

    const redacted = redactSensitiveData(circular);
    expect(redacted["name"]).toBe("root");
    expect(redacted["self"]).toBe("[Circular]");
  });

  it("sanitizes Error objects including message and stack traces", () => {
    const err = new Error("Connection failed with token AKIAIOSFODNN7EXAMPLE");
    const sanitized = redactSensitiveData(err);
    expect(sanitized.name).toBe("Error");
    expect(sanitized.message).toContain("[REDACTED]");
    expect(sanitized.message).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("sanitizes private keys, database URIs, and Stripe/Google keys", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y...\n-----END RSA PRIVATE KEY-----";
    expect(sanitizeString(pem)).toBe("[REDACTED]");

    const dbUri = "connect to postgres://admin:SuperSecretPass123@prod-db.internal:5432/main";
    expect(sanitizeString(dbUri)).not.toContain("SuperSecretPass123");
    expect(sanitizeString(dbUri)).toContain("[REDACTED]");

    const google = "AIzaSyD1234567890abcdefghijklmnopqrstuv";
    expect(sanitizeString(google)).toBe("[REDACTED]");

    const stripe = "sk_live_51Abcdefghijklmnopqrstuv";
    expect(sanitizeString(stripe)).toBe("[REDACTED]");
  });

  it("masks absolute machine and user paths to preserve path privacy", () => {
    const raw = "Error in file /Users/jayesh/Documents/codefy/packages/core/src/auth.ts at line 42";
    const masked = maskAbsolutePaths(raw, "/Users/jayesh/Documents/codefy");
    expect(masked).not.toContain("/Users/jayesh");
    expect(masked).toContain("packages/core/src/auth.ts");
  });
});
