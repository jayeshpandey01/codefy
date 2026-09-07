import { describe, expect, it } from "vitest";
import { detectSyntaxErrors } from "../parser/syntax-errors.js";
import { createAnalysisEngine } from "../engine.js";

describe("Multi-Language Syntax Error Detection", () => {
  describe("detectSyntaxErrors unit tests", () => {
    it("detects syntax error in broken TypeScript", async () => {
      const code = `
        function brokenTypeScript( {
          const x = 10;
          return x;
        }
      `;
      const findings = await detectSyntaxErrors(
        "src/broken.ts",
        code,
        "typescript",
      );
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe("syntax-error");
      expect(findings[0]?.severity).toBe("high");
      expect(findings[0]?.trace.steps[0]?.line).toBeGreaterThanOrEqual(2);
    });

    it("detects syntax error in broken TSX (unclosed/mismatched JSX)", async () => {
      const code = `
        export function BrokenComponent() {
          return (
            <div>
              <span>hello
            </div>
          );
        }
      `;
      const findings = await detectSyntaxErrors("src/broken.tsx", code, "tsx");
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe("syntax-error");
    });

    it("detects syntax error in broken Python", async () => {
      const code = `
def calculate_total(items
    total = 0
    for item in items:
        total += item
    return total
      `;
      const findings = await detectSyntaxErrors("app/calc.py", code, "python");
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe("syntax-error");
      expect(findings[0]?.title).toContain("python");
    });

    it("detects syntax error in broken JSON (trailing comma / missing value)", async () => {
      const code = `{
  "name": "whoami",
  "version": 
}`;
      const findings = await detectSyntaxErrors("config.json", code, "json");
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe("syntax-error");
    });

    it("detects syntax error in broken Go", async () => {
      const code = `
        package main
        func main() {
            var x int = 
        }
      `;
      const findings = await detectSyntaxErrors("main.go", code, "go");
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]?.ruleId).toBe("syntax-error");
    });

    it("returns 0 findings for valid TypeScript", async () => {
      const code = `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `;
      const findings = await detectSyntaxErrors(
        "src/valid.ts",
        code,
        "typescript",
      );
      expect(findings).toHaveLength(0);
    });

    it("returns 0 findings for valid JSON", async () => {
      const code = JSON.stringify({ name: "whoami", count: 42 }, null, 2);
      const findings = await detectSyntaxErrors("valid.json", code, "json");
      expect(findings).toHaveLength(0);
    });
  });

  describe("AnalysisEngine end-to-end integration", () => {
    const engine = createAnalysisEngine();

    it("scans a broken TSX file and surfaces syntax errors alongside normal engine scan", async () => {
      const code = `
        export default function Page() {
          return (
            <LayoutWrapper>
            
          )
        }
      `;
      const result = await engine.scanFile("app/page.tsx", code);
      expect(result.findings.length).toBeGreaterThanOrEqual(1);
      expect(result.findings[0]?.ruleId).toBe("syntax-error");
      expect(result.findings[0]?.status).toBe("confirmed");
      expect(result.findings[0]?.trace.steps[0]?.filePath).toBe("app/page.tsx");
    });
  });
});
