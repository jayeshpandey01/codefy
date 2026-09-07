import { describe, expect, it } from "vitest";

import { scanForSecrets } from "../../secrets/detector.js";

describe("scanForSecrets", () => {
  it("flags an AWS access key by regex", () => {
    const source = `const key = "AKIAABCDEFGHIJKLMNOP";`;
    const findings = scanForSecrets(source, "config.ts");

    expect(findings.some((f) => f.kind === "aws-access-key")).toBe(true);
  });

  it("flags a GitHub personal access token by regex", () => {
    const source = `const token = "ghp_${"a".repeat(36)}";`;
    const findings = scanForSecrets(source, "config.ts");

    expect(findings.some((f) => f.kind === "github-token")).toBe(true);
  });

  it("flags a generic api key assignment", () => {
    const source = `apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456"`;
    const findings = scanForSecrets(source, "config.ts");

    expect(findings.some((f) => f.kind === "generic-api-key")).toBe(true);
  });

  it("flags a long high-entropy quoted string even without a recognizable prefix", () => {
    const source = `const blob = "aX9kQ2z8pL0mR7yT4wV6nB1cF3sJ5uH9";`;
    const findings = scanForSecrets(source, "config.ts");

    expect(findings.some((f) => f.kind === "high-entropy-string")).toBe(true);
  });

  it("does not flag ordinary low-entropy prose text", () => {
    const source = `const greeting = "hello world this is just some plain english text";`;
    const findings = scanForSecrets(source, "config.ts");

    expect(findings).toHaveLength(0);
  });

  it("reports a 1-based line number matching where the secret appears", () => {
    const source = `// line 1\n// line 2\nconst key = "AKIAABCDEFGHIJKLMNOP";\n`;
    const findings = scanForSecrets(source, "config.ts");

    expect(findings[0]?.line).toBe(3);
  });

  it("does not scan package-lock.json or lockfiles for secrets", () => {
    const source = `
      {
        "integrity": "sha512-VnS+rV9y0O11lU4Qyvj4w8Ykabcdef1234567890==",
        "resolved": "https://registry.npmjs.org/@babel/core/-/core-7.24.0.tgz"
      }
    `;
    const findings = scanForSecrets(source, "package-lock.json");
    expect(findings).toHaveLength(0);
  });

  it("suppresses sha512 and sha256 checksum hashes from high-entropy detection in regular files", () => {
    const source = `
      const integrity = "sha512-VnS+rV9y0O11lU4Qyvj4w8Ykabcdef1234567890==";
      const downloadUrl = "https://registry.npmjs.org/download/package-tarball.tgz";
      const sha256Hash = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
    `;
    const findings = scanForSecrets(source, "bundle.ts");
    expect(findings).toHaveLength(0);
  });
});
