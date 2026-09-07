import { describe, expect, it } from "vitest";
import { redactSensitiveData, sanitizeString } from "../../logging/redactor.js";

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
});
