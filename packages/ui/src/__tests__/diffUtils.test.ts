import { describe, expect, it } from "vitest";
import type { Finding } from "@whoami/types";
import {
  computeSideBySideDiff,
  generateFindingDiff,
  tokenizeCode,
} from "../components/diffUtils.js";

describe("diffUtils", () => {
  describe("tokenizeCode", () => {
    it("tokenizes keywords, strings, functions, and types correctly", () => {
      const code = 'import { useState } from "react"; const count: number = 0;';
      const tokens = tokenizeCode(code);

      expect(tokens.some((t) => t.type === "keyword" && t.text === "import")).toBe(true);
      expect(tokens.some((t) => t.type === "string" && t.text === '"react"')).toBe(true);
      expect(tokens.some((t) => t.type === "type" && t.text === "number")).toBe(true);
    });

    it("handles empty string gracefully", () => {
      expect(tokenizeCode("")).toEqual([]);
    });
  });

  describe("computeSideBySideDiff", () => {
    it("computes side-by-side diff with aligned rows, additions, and deletions", () => {
      const before = "line 1\nline 2 deleted\nline 3";
      const after = "line 1\nline 2 added\nline 3";

      const { rows, additionsCount, deletionsCount } = computeSideBySideDiff(
        before,
        after,
        1,
      );

      expect(deletionsCount).toBe(1);
      expect(additionsCount).toBe(1);
      expect(rows.length).toBe(3);

      expect(rows[0]!.left.type).toBe("unchanged");
      expect(rows[0]!.right.type).toBe("unchanged");

      expect(rows[1]!.left.type).toBe("deleted");
      expect(rows[1]!.left.prefix).toBe("-");
      expect(rows[1]!.right.type).toBe("added");
      expect(rows[1]!.right.prefix).toBe("+");

      expect(rows[2]!.left.type).toBe("unchanged");
      expect(rows[2]!.right.type).toBe("unchanged");
    });

    it("inserts empty/hatched fillers for asymmetric line insertions", () => {
      const before = "const a = 1;";
      const after = "const a = 1;\nconst b = 2;\nconst c = 3;";

      const { rows, additionsCount, deletionsCount } = computeSideBySideDiff(
        before,
        after,
        1,
      );

      expect(deletionsCount).toBe(0);
      expect(additionsCount).toBe(2);
      expect(rows.length).toBe(3);

      expect(rows[0]!.left.type).toBe("unchanged");
      expect(rows[0]!.right.type).toBe("unchanged");

      expect(rows[1]!.left.type).toBe("empty");
      expect(rows[1]!.right.type).toBe("added");
      expect(rows[1]!.right.text).toBe("const b = 2;");

      expect(rows[2]!.left.type).toBe("empty");
      expect(rows[2]!.right.type).toBe("added");
      expect(rows[2]!.right.text).toBe("const c = 3;");
    });
  });

  describe("generateFindingDiff", () => {
    it("generates contextual code diff for a command injection finding", () => {
      const finding: Finding = {
        id: "f-1",
        ruleId: "js-command-injection-exec",
        status: "confirmed",
        severity: "critical",
        title: "Command Injection in exec",
        description: "Untrusted input reaches exec()",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "command-injection",
          steps: [
            {
              role: "source",
              label: "req.body.filename",
              filePath: "app/convert.ts",
              line: 6,
            },
            {
              role: "sink",
              label: "exec(cmd)",
              filePath: "app/convert.ts",
              line: 8,
            },
          ],
        },
      };

      const result = generateFindingDiff(finding);
      expect(result.breadcrumb).toEqual(["app", "convert.ts"]);
      expect(result.filePath).toBe("app/convert.ts");
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.deletionsCount).toBeGreaterThan(0);
      expect(result.additionsCount).toBeGreaterThan(0);
    });

    it("generates path traversal diff for a .tsx file without falling back to RootLayout", () => {
      const finding: Finding = {
        id: "f-pt-1",
        ruleId: "js-path-traversal",
        status: "confirmed",
        severity: "high",
        title: "Path Traversal via filesystem operation",
        description: "Unsanitized path reaches fs.readFileSync",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "path-traversal",
          steps: [
            {
              role: "sink",
              label: "test_napi.tsx:6",
              filePath: "test_napi.tsx",
              line: 6,
            },
          ],
        },
      };

      const result = generateFindingDiff(finding);
      expect(result.filePath).toBe("test_napi.tsx");
      const rightText = result.rows.map((r) => r.right.text).join("\n");
      expect(rightText).toContain("Path traversal detected");
      expect(rightText).not.toContain("ThemeProvider");
    });

    it("generates syntax error diff tailored to the specific component and line", () => {
      const finding: Finding = {
        id: "f-syntax-1",
        ruleId: "syntax-error",
        scope: "parser",
        code: "syntax_error",
        status: "confirmed",
        severity: "high",
        title: "Syntax Error (tsx) at line 20",
        description: "Missing closing tag",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "code-injection",
          steps: [
            {
              role: "sink",
              label: "hero-section.tsx:20",
              filePath: "components/hero-section.tsx",
              line: 20,
            },
          ],
        },
      };

      const result = generateFindingDiff(finding);
      expect(result.filePath).toBe("components/hero-section.tsx");
      const rightText = result.rows.map((r) => r.right.text).join("\n");
      expect(rightText).toContain("hero-section");
      expect(rightText).toContain("Fixed: Closed tag");
    });

    it("generates JWT & auth verification diff for orchestrator vuln assessment", () => {
      const finding: Finding = {
        id: "remote-vuln-1",
        ruleId: "remote-cve-2024-jwt-bypass",
        scope: "orchestrator",
        code: "vuln-assessment",
        status: "confirmed",
        severity: "critical",
        title: "Unverified JWT Token Signature",
        description: "Remote endpoint accepts unverified JWTs",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "code-injection",
          steps: [
            {
              role: "sink",
              label: "https://api.target.internal/api/auth",
              filePath: "https://api.target.internal/api/auth",
              line: 1,
            },
          ],
        },
      };

      const result = generateFindingDiff(finding);
      const rightText = result.rows.map((r) => r.right.text).join("\n");
      expect(rightText).toContain("jwtVerify");
      expect(rightText).toContain("RS256");
    });

    it("generates sensitive file protection diff for orchestrator content discovery", () => {
      const finding: Finding = {
        id: "remote-content-1",
        ruleId: "remote-exposed-env-file",
        scope: "orchestrator",
        code: "content-discovery",
        status: "confirmed",
        severity: "high",
        title: "Exposed .env Backup File",
        description: "Remote endpoint serves .env.backup",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "path-traversal",
          steps: [
            {
              role: "sink",
              label: "https://api.target.internal/.env.backup",
              filePath: "https://api.target.internal/.env.backup",
              line: 1,
            },
          ],
        },
      };

      const result = generateFindingDiff(finding);
      const rightText = result.rows.map((r) => r.right.text).join("\n");
      expect(rightText).toContain(".env");
      expect(rightText).toContain("nextConfig");
    });
  });
});
