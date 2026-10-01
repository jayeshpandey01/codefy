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

  it("detects Python source-to-sink security paths", async () => {
    const code = `
def handler(request):
    value = request.args.get("value")
    os.system(value)
    cursor.execute(f"SELECT * FROM users WHERE id={value}")
    requests.get(value)
    open(value)
    eval(value)
`;
    const result = await engine.scanFile("src/routes/handler.py", code);
    expect(result.findings.map((finding) => finding.ruleId).sort()).toEqual([
      "py-code-injection",
      "py-command-injection",
      "py-path-traversal",
      "py-sql-injection",
      "py-ssrf",
    ]);
    expect(result.findings.every((finding) => finding.trace.steps.length >= 2)).toBe(true);
  });

  it("does not report parameterized Python SQL or shell=False subprocess calls", async () => {
    const code = `
def handler(request):
    value = request.args.get("value")
    cursor.execute("SELECT * FROM users WHERE id = ?", (value,))
    subprocess.run(["echo", value], shell=False)
`;
    const result = await engine.scanFile("src/routes/handler.safe.py", code);
    expect(result.findings).toHaveLength(0);
  });

  it("keeps unknown function parameters unconfirmed in both languages", async () => {
    const javascript = `
function run(command) {
  exec(command);
}
`;
    const python = `
def run(command):
    os.system(command)
`;
    const [jsResult, pythonResult] = await Promise.all([
      engine.scanFile("src/routes/unknown-source.js", javascript),
      engine.scanFile("src/routes/unknown-source.py", python),
    ]);

    expect(jsResult.findings[0]?.status).toBe("needs-verification");
    expect(pythonResult.findings[0]?.status).toBe("needs-verification");
  });

  it("does not treat request-looking text inside Python literals as a source", async () => {
    const code = `
def run():
    os.system("request.args")
`;
    const result = await engine.scanFile("src/routes/literal.py", code);
    expect(result.findings).toHaveLength(0);
  });

  it.each([
    ["commandInjection", "export function run(req: any) { exec(req.body.command); }", "js-command-injection-exec"],
    ["sqlInjection", "export function run(req: any, db: any) { db.query(`SELECT ${req.params.id}`); }", "js-sql-injection-string-concat"],
    ["ssrf", "export function run(req: any) { fetch(req.query.url); }", "js-ssrf-unvalidated-url"],
    ["pathTraversal", "import fs from 'fs'; export function run(req: any) { const file = req.query.file; return fs.readFileSync(file, 'utf8'); }", "js-path-traversal"],
    ["codeInjection", "export function run(req: any) { eval(req.body.code); }", "js-code-injection"],
    ["secretDetection", "const api_key = 'abcdefghijklmnopqrstuvwxyz123456';", "secret-generic-api-key"],
  ] as const)("honors the %s offline rule switch", async (toggle, source, expectedRuleId) => {
    const disabled = await engine.scanFile(`toggle-${toggle}.ts`, source, { [toggle]: false });
    expect(disabled.findings.some((finding) => finding.ruleId === expectedRuleId)).toBe(false);

    const enabled = await engine.scanFile(`toggle-${toggle}-enabled.ts`, source, { [toggle]: true });
    expect(enabled.findings.some((finding) => finding.ruleId === expectedRuleId)).toBe(true);
  });

  it("keeps syntax checks enabled when every security rule is disabled", async () => {
    const result = await engine.scanFile("toggle-syntax.ts", "function broken( {", {
      commandInjection: false,
      sqlInjection: false,
      ssrf: false,
      pathTraversal: false,
      codeInjection: false,
      secretDetection: false,
    });
    expect(result.findings.map((finding) => finding.ruleId)).toContain("syntax-error");
  });

  it.each([
    ["commandInjection", "def run(request):\n    os.system(request.args.get('cmd'))\n", "py-command-injection"],
    ["sqlInjection", "def run(request, cursor):\n    cursor.execute(f\"SELECT {request.args.get('id')}\")\n", "py-sql-injection"],
    ["ssrf", "def run(request):\n    requests.get(request.args.get('url'))\n", "py-ssrf"],
    ["pathTraversal", "def run(request):\n    open(request.args.get('path'))\n", "py-path-traversal"],
    ["codeInjection", "def run(request):\n    eval(request.args.get('code'))\n", "py-code-injection"],
  ] as const)("applies the %s switch to Python rules too", async (toggle, source, expectedRuleId) => {
    const result = await engine.scanFile(`toggle-${toggle}.py`, source, { [toggle]: false });
    expect(result.findings.some((finding) => finding.ruleId === expectedRuleId)).toBe(false);
  });
});
