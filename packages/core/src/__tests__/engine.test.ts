import { describe, expect, it } from "vitest";
import { createAnalysisEngine } from "../engine.js";

describe("AnalysisEngine (end-to-end AST pattern + taint analysis)", () => {
  const engine = createAnalysisEngine();

  it("detects command injection vulnerability from req.body to exec", async () => {
    const code = `
      import { exec } from 'child_process';
      export function handler(req: any) {
        const cmd = req.body.cmd;
        exec(cmd);
      }
    `;
    const result = await engine.scanFile("src/routes/exec.ts", code);
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.ruleId).toBe("js-command-injection-exec");
    expect(finding.status).toBe("confirmed");
    expect(finding.severity).toBe("critical");
    expect(finding.ruleYaml).toBeDefined();
    expect(finding.ruleYaml).toContain("id: js-command-injection-exec");
    expect(finding.reason).toBeDefined();
    expect(finding.hint).toBeDefined();
    expect(finding.fix).toBeDefined();
    expect(finding.link).toBe("https://cwe.mitre.org/data/definitions/78.html");
    expect(finding.trace.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("detects SQL injection vulnerability from req.params to db.query with concatenation", async () => {
    const code = `
      export function getProfile(req: any, db: any) {
        const id = req.params.id;
        return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
      }
    `;
    const result = await engine.scanFile("src/routes/profile.ts", code);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("js-sql-injection-string-concat");
    expect(result.findings[0]?.status).toBe("confirmed");
  });

  it("detects SSRF vulnerability from req.query to fetch", async () => {
    const code = `
      export function proxy(req: any) {
        const target = req.query.url;
        return fetch(target);
      }
    `;
    const result = await engine.scanFile("src/routes/proxy.ts", code);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("js-ssrf-unvalidated-url");
  });

  it("detects path traversal vulnerability from req.query to fs.readFileSync", async () => {
    const code = `
      import fs from 'fs';
      export function download(req: any) {
        const file = req.query.file;
        return fs.readFileSync(file, 'utf8');
      }
    `;
    const result = await engine.scanFile("src/routes/file.ts", code);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("js-path-traversal");
    expect(result.findings[0]?.cwe).toBe("CWE-22");
  });

  it("detects code injection vulnerability from req.body to eval", async () => {
    const code = `
      export function calc(req: any) {
        const formula = req.body.formula;
        return eval(formula);
      }
    `;
    const result = await engine.scanFile("src/routes/calc.ts", code);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("js-code-injection");
    expect(result.findings[0]?.status).toBe("confirmed");
  });

  it("ignores safe parameterized queries", async () => {
    const code = `
      export function getProfileSafe(req: any, db: any) {
        const id = req.params.id;
        return db.query('SELECT * FROM users WHERE id = $1', [id]);
      }
    `;
    const result = await engine.scanFile("src/routes/profile.safe.ts", code);
    expect(result.findings).toHaveLength(0);
  });
});
