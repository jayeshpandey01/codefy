/**
 * Rule YAML content, inlined as string constants so it ships safely inside
 * both build targets — `dist-node` (real filesystem available) and
 * `dist-wasm` (runs inside a browser-like Web Worker with no `fs`). Reading
 * the `.yml` files at runtime via `fs` would work for the Node build but
 * break the wasm one, and bundler asset-loader conventions differ enough
 * between tsup/esbuild and Vite that no single `import './x.yml'` form is
 * guaranteed to survive both builds unmodified — so the content is just
 * inlined directly instead.
 *
 * IMPORTANT: kept byte-for-byte identical to the corresponding file in this
 * same directory (js-command-injection-exec.yml, etc.), which remains the
 * canonical, spec-verbatim, human-readable copy (see
 * docs/DETECTION-ENGINE-SPEC.md §A.2) — with one deliberate exception, noted
 * inline on JS_SQL_INJECTION_STRING_CONCAT_RULE below, where the spec's YAML
 * as literally written does not actually match anything under the real
 * @ast-grep/napi engine.
 */

export const JS_COMMAND_INJECTION_EXEC_RULE = `id: js-command-injection-exec
language: TypeScript
severity: error
message: >
  User-controlled input reaches child_process.exec/execSync with shell interpretation enabled.
  This allows arbitrary OS command execution.
note: |
  exec()/execSync() run their argument through /bin/sh (or cmd.exe), so any shell metacharacter
  in tainted input (;, |, &&, $(), backticks) breaks out of the intended command.
rule:
  any:
    - pattern: $CP.exec($CMD)
    - pattern: $CP.exec($CMD, $$$)
    - pattern: $CP.execSync($CMD)
    - pattern: $CP.execSync($CMD, $$$)
    - pattern: exec($CMD)
    - pattern: exec($CMD, $$$)
    - pattern: execSync($CMD)
    - pattern: execSync($CMD, $$$)
constraints:
  CMD:
    not:
      any:
        - kind: string
        - kind: template_string
fix: |
  $CP.execFile($BIN, [$$$ARGS], $$$)
`;

// Deviation from docs/DETECTION-ENGINE-SPEC.md §A.2's verbatim YAML (see
// src/rules/js-sql-injection-string-concat.yml for that unmodified text):
// under the real @ast-grep/napi 0.45.3 engine, a bare `has: { field: arguments, ... }`
// only searches the immediate children of the `arguments` field with its
// default `stopBy: 'neighbor'`, which empirically does not find the
// template_string/binary_expression nested one level inside it — the rule
// as literally specified matches nothing at all, including the spec's own
// intended vulnerable case. Adding `stopBy: 'end'` (a real, documented
// ast-grep Relation option — see rule.d.ts) makes `has` search the full
// subtree under that field instead of just its direct children, which is
// what the spec's prose description of this rule actually says it should
// do. Verified empirically against both fixtures before landing this.
export const JS_SQL_INJECTION_STRING_CONCAT_RULE = `id: js-sql-injection-string-concat
language: TypeScript
severity: error
message: >
  SQL query built via string concatenation/template literal interpolation instead of
  parameterized placeholders — classic SQL injection.
rule:
  any:
    - pattern: $DB.query($QUERY)
    - pattern: $DB.query($QUERY, $$$)
    - pattern: $KNEX.raw($QUERY)
    - pattern: $PRISMA.$queryRawUnsafe($QUERY)
  has:
    field: arguments
    stopBy: end
    any:
      - kind: template_string
        has: { kind: template_substitution, stopBy: end }
      - kind: binary_expression
        has: { pattern: "+" }
note: |
  Safe replacements: parameterized placeholders ($DB.query('...$1...', [val])),
  Prisma tagged templates ($queryRaw\`...\${val}...\`), or knex.raw('?', [val]).
`;

export const JS_SSRF_UNVALIDATED_URL_RULE = `id: js-ssrf-unvalidated-url
language: TypeScript
severity: warning
message: >
  A user-controlled value reaches an outbound HTTP call (fetch/axios/http.request) with no
  visible URL-scheme/host validation on the same path — potential SSRF.
rule:
  any:
    - pattern: fetch($URL)
    - pattern: fetch($URL, $$$)
    - pattern: $AXIOS.get($URL)
    - pattern: $AXIOS.get($URL, $$$)
    - pattern: $HTTP.request($URL)
    - pattern: $HTTP.request($URL, $$$)
constraints:
  URL:
    not:
      kind: string
note: |
  This rule flags the candidate path; the deterministic sanitizer-filter logic (A.3) then checks
  the same path for a private-IP/scheme allowlist guard before promoting to a Finding — the
  ast-grep rule alone never decides confirmed/discarded.
`;

export const JS_PATH_TRAVERSAL_RULE = `id: js-path-traversal
language: TypeScript
severity: error
message: >
  User-controlled input reaches filesystem read operations without path normalization and boundary validation.
note: |
  Unsanitized file paths allow attackers to escape the intended directory using ../ sequences.
rule:
  any:
    - pattern: $FS.readFile($PATH, $$$)
    - pattern: $FS.readFileSync($PATH, $$$)
    - pattern: $FS.createReadStream($PATH, $$$)
    - pattern: fs.readFile($PATH, $$$)
    - pattern: fs.readFileSync($PATH, $$$)
    - pattern: fs.createReadStream($PATH, $$$)
    - pattern: readFile($PATH, $$$)
    - pattern: readFileSync($PATH, $$$)
    - pattern: createReadStream($PATH, $$$)
constraints:
  PATH:
    not:
      any:
        - kind: string
`;

export const JS_CODE_INJECTION_RULE = `id: js-code-injection
language: TypeScript
severity: error
message: >
  User-controlled input reaches eval, Function constructor, or vm execution context.
note: |
  Dynamic code evaluation allows arbitrary JavaScript execution in the server runtime.
rule:
  any:
    - pattern: eval($CODE)
    - pattern: new Function($CODE, $$$)
    - pattern: Function($CODE, $$$)
    - pattern: $VM.runInContext($CODE, $$$)
    - pattern: $VM.runInNewContext($CODE, $$$)
    - pattern: $VM.runInThisContext($CODE, $$$)
constraints:
  CODE:
    not:
      any:
        - kind: string
`;

/** Every rule this package ships, in no particular order. */
export const ALL_RULES: readonly string[] = [
  JS_COMMAND_INJECTION_EXEC_RULE,
  JS_SQL_INJECTION_STRING_CONCAT_RULE,
  JS_SSRF_UNVALIDATED_URL_RULE,
  JS_PATH_TRAVERSAL_RULE,
  JS_CODE_INJECTION_RULE,
];

export interface RuleRemediationInfo {
  readonly ruleId: string;
  readonly ruleYaml: string;
  readonly code: string;
  readonly scope: "security" | "parser" | "secrets" | string;
  readonly reason: string;
  readonly hint: string;
  readonly fix: string;
  readonly link: string;
}

export const RULE_METADATA_BY_ID: Record<string, RuleRemediationInfo> = {
  "js-command-injection-exec": {
    ruleId: "js-command-injection-exec",
    ruleYaml: JS_COMMAND_INJECTION_EXEC_RULE,
    code: "command_injection",
    scope: "security",
    reason:
      "User-controlled input reaches child_process.exec/execSync with shell interpretation enabled, allowing arbitrary OS command execution.",
    hint: "Use child_process.execFile or spawn with argument arrays instead of passing raw command strings to a shell.",
    fix: "import { execFile } from 'node:child_process';\nexecFile(binaryPath, [arg1, arg2], (err, stdout) => { ... });",
    link: "https://cwe.mitre.org/data/definitions/78.html",
  },
  "js-sql-injection-string-concat": {
    ruleId: "js-sql-injection-string-concat",
    ruleYaml: JS_SQL_INJECTION_STRING_CONCAT_RULE,
    code: "sql_injection",
    scope: "security",
    reason:
      "SQL query built via string concatenation or template literal interpolation allows attackers to alter query logic and extract/modify database records.",
    hint: "Use parameterized placeholders ($1, ?), Prisma tagged templates ($queryRaw), or Knex bindings.",
    fix: "await db.query('SELECT * FROM users WHERE id = $1', [userId]);",
    link: "https://cwe.mitre.org/data/definitions/89.html",
  },
  "js-ssrf-unvalidated-url": {
    ruleId: "js-ssrf-unvalidated-url",
    ruleYaml: JS_SSRF_UNVALIDATED_URL_RULE,
    code: "ssrf",
    scope: "security",
    reason:
      "User-controlled URL is passed to an outbound HTTP client (fetch/axios/http) without scheme/host validation, risking SSRF against internal services or cloud metadata.",
    hint: "Parse with new URL() and validate scheme (https:) and host against a strict allowlist before dispatching requests.",
    fix: "const parsed = new URL(targetUrl);\nif (!ALLOWED_DOMAINS.includes(parsed.hostname)) throw new Error('Untrusted host');\nawait fetch(parsed.toString());",
    link: "https://cwe.mitre.org/data/definitions/918.html",
  },
  "js-path-traversal": {
    ruleId: "js-path-traversal",
    ruleYaml: JS_PATH_TRAVERSAL_RULE,
    code: "path_traversal",
    scope: "security",
    reason:
      "User-controlled path passed directly to filesystem functions allows attackers to escape the intended directory via ../ sequences.",
    hint: "Resolve path against base directory with path.resolve and verify the result starts with the base path.",
    fix: "const safePath = path.resolve(BASE_DIR, path.normalize(userInput));\nif (!safePath.startsWith(BASE_DIR)) throw new Error('Path traversal detected');",
    link: "https://cwe.mitre.org/data/definitions/22.html",
  },
  "js-code-injection": {
    ruleId: "js-code-injection",
    ruleYaml: JS_CODE_INJECTION_RULE,
    code: "code_injection",
    scope: "security",
    reason:
      "Passing untrusted input to eval(), Function(), or vm.runInThisContext allows arbitrary JavaScript execution in the server runtime.",
    hint: "Avoid dynamic code evaluation. Parse structured data with JSON.parse or use an isolated AST expression evaluator.",
    fix: "const safeData = JSON.parse(userJsonString);",
    link: "https://cwe.mitre.org/data/definitions/95.html",
  },
};
