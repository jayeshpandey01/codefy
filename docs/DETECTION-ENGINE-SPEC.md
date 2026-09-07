# WhoAmI Detection Engine Spec

Durable reference for `packages/core`'s detection content — sources/sinks/sanitizers, ast-grep rules, sanitizer-verification logic, and PoC verification templates. This is the concrete "what"; `.claude/skills/taint-engine/SKILL.md` describes the "how" (pipeline shape, file layout, non-negotiables) and defers to this doc for actual rule content.

Nothing in this file is implemented yet — `packages/core` does not exist. This is the spec the monorepo scaffold (a separate, not-yet-started plan) will build against.

---

## A.0 Real-World Methodology & Tool Landscape

How real bug-bounty researchers and AppSec engineers actually work, and how WhoAmI's architecture relates to the wider tool landscape — recorded so the reasoning survives even though most surveyed tools aren't being adopted.

### The 4-stage methodology

```
Stage 1: Attack Surface & Route Recon      → WhoAmI: sources.ts
  Map unauthenticated HTTP routes, params, entrypoints

Stage 2: Sinks & Sensitive Operations       → WhoAmI: sinks.ts
  Locate DB queries, child processes, deserializers, file ops

Stage 3: Data-Flow & Sanitizer Auditing     → WhoAmI: propagate.ts + sanitizer-filter.ts
  Trace Source ──▶ Sink; audit intermediary validation

Stage 4: Live Verification & PoC            → WhoAmI: A.4 probes, user-triggered
  Send a targeted, non-destructive request to prove exploitability
```

WhoAmI's pipeline is a direct in-process implementation of this methodology, not a different approach — the difference from a human researcher is speed and determinism, not method.

### Tool landscape survey

Each tool assessed honestly against one question: can it run in-process inside a VS Code extension host (real Node.js) or a Tauri webview (no Node runtime, WASM only)? "No" isn't a dismissal — it's the reason a given tool isn't part of WhoAmI's core, documented as a tradeoff rather than an oversight.

| Tool                        | Category                                                                            | In-process feasible?                                                                                                                                 | Disposition                                                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ast-grep**                | AST structural pattern matching                                                     | **Yes.** Native napi addon for Node (extension host), a genuine WASM build for the browser/webview (desktop app)                                     | **Adopted.** WhoAmI's structural pattern-matching engine, dual-built from one TypeScript source targeting `@ast-grep/napi` and `@ast-grep/wasm` respectively                                                                                                      |
| **Semgrep**                 | Semantic pattern matching, CSTs                                                     | No. `semgrep-core` ships as a Python-distributed native binary; no embeddable JS/WASM build exists                                                   | Documented only. Adopting it would reintroduce exactly the external-process dependency ast-grep's dual-build was designed to avoid                                                                                                                                |
| **CodeQL**                  | Interprocedural taint tracking via a compiled relational database + Datalog queries | No. Requires the CodeQL CLI and compiling a fresh database per scan; CodeQL's own docs describe it as unsuited to sub-second, per-keystroke feedback | Documented as a candidate **future opt-in "deep scan"** capability (periodic, user-triggered, out of the real-time path) — not part of Phase 1                                                                                                                    |
| **Joern**                   | Code Property Graph (AST + CFG + PDG)                                               | No. JVM-based CLI, no in-process JS binding                                                                                                          | Same disposition as CodeQL — a future deep-scan candidate, not real-time                                                                                                                                                                                          |
| **TruffleHog (`--verify`)** | Verified secret detection via live API calls                                        | No. Standalone Go binary, no Node/npm library; live verification means outbound network calls to third-party providers                               | **Not adopted** — WhoAmI uses its own in-process regex + Shannon-entropy secret detector instead (see `CLAUDE.md`'s "Why In-Process Secret Detection, Not TruffleHog" ADR). Live verification stays out of scope until an explicit, user-triggered future feature |
| **Nuclei**                  | Templated HTTP/TCP DAST scanning                                                    | No. Go binary                                                                                                                                        | Not adopted — functionally redundant with WhoAmI's own narrower, purpose-built PoC probes (A.4), which check 4 specific non-destructive conditions rather than running a general template engine                                                                  |
| **Caido / mitmproxy**       | Interactive HTTP request replay/inspection                                          | No. Separate proxy processes                                                                                                                         | Out of scope — WhoAmI's PoC probes are fire-a-single-request-and-check, not an interactive proxy workflow                                                                                                                                                         |

### Academic findings that validate the existing design

These are recorded as _rationale_ for decisions already made elsewhere in this project, not as new requirements.

- **Sadowski et al. 2018**, "Lessons from Building Static Analysis Tools at Google," _CACM_ 61(4):58–66. Developer trust in a static analysis tool collapses once its false-positive rate exceeds roughly 10%; Google's response was to kill standalone dashboards and require every warning to appear inline in the developer's own review loop with an automated fix available. This is the paper-level justification for `CLAUDE.md`'s "Precision & Trust Over Volume" principle and for WhoAmI's finding-card + 1-click-fix UX instead of a separate dashboard view.
- **Yamaguchi et al. 2014**, "Modeling and Discovering Vulnerabilities with Code Property Graphs," _IEEE S&P_, 590–604. Syntax matching alone (flagging any call to `exec()`) produces overwhelming noise; combining AST, control-flow, and data-dependence graphs to prove actual _reachability_ from an untrusted source to a sink is what eliminates the majority of false positives. This is the rationale for A.3's `sanitizer-filter.ts` doing real guard-body analysis (does the guarding function's own body actually perform a safety check that gates the sink call) rather than a keyword heuristic, and for treating every ast-grep match (A.2) as a _candidate_ the taint pipeline must still resolve — never a Finding on its own.
- **Purba et al. 2024**, "Benchmarking Large Language Models for Vulnerability Detection: The False Sense of Security," arXiv:2403.04671. Feeding an LLM a whole codebase and asking it to "find bugs" produces hallucination rates of 35–55%. Giving the same model one exact static taint path and asking a single narrow question — "does this specific step sanitize this specific input?" — pushes precision above 90%. This is the exact rationale already encoded in `ILlmTriageProvider`'s interface: it is never an open-ended chat call, only a structured classification of one candidate path.

---

## A.1 Unified Taint Specification Table

### JavaScript / TypeScript (Node.js, Express, Fastify, Next.js)

| Class                                                    | Source                                                                                | Sink                                                                                                                                                                                   | Sanitizer                                                                                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command Injection (CWE-78)                               | `req.body`, `req.query`, `req.params`, `req.headers`, `req.cookies`, `request.json()` | `child_process.exec`, `execSync`, `spawn(..., {shell:true})`                                                                                                                           | `execFile`/`spawn` without `shell:true` + an argv array (no string concatenation); allowlist regex on the argument value                                                        |
| SQL / NoSQL Injection (CWE-89 / CWE-943)                 | same sources                                                                          | `db.query(str)`, `sequelize.query(str)`, `prisma.$queryRawUnsafe(str)`, `knex.raw(str)` where `str` contains interpolation                                                             | Parameterized placeholders (`$1`/`?`), Prisma's `$queryRaw` tagged template, `knex.raw('?', [val])`, ORM schema-validated query builders                                        |
| SSRF (CWE-918)                                           | same sources, especially any field consumed as a URL                                  | `fetch(url)`, `axios.get(url)`, `http.request(url)`                                                                                                                                    | URL parsing + scheme allowlist (`https:` only) + private/loopback IP block (RFC1918 `10.0.0.0/8`,`172.16.0.0/12`,`192.168.0.0/16`; `127.0.0.0/8`; `169.254.0.0/16`; IPv6 `::1`) |
| Path Traversal / Arbitrary File Access (CWE-22 / CWE-73) | same sources                                                                          | `fs.readFile()`, `fs.createReadStream()`, `path.resolve(base, userParam)`                                                                                                              | `path.normalize()` followed by `path.resolve(...).startsWith(allowedRoot)` — the check must happen _after_ normalization, not before                                            |
| Code Injection / Dynamic Evaluation (CWE-95)             | same sources                                                                          | `eval()`, `new Function(...)`, `vm.runInContext()`                                                                                                                                     | None recognized. Any tainted value reaching these sinks is `confirmed` — Phase 1 accepts no sanitizer pattern for this class                                                    |
| Prototype Pollution / Object Injection (CWE-1321)        | same sources, especially a JSON request body deep-merged or cloned                    | Unguarded recursive merge/clone (`_.merge`, `Object.assign` in a loop over attacker-controlled keys, a hand-rolled deep-clone) writing into an object using an attacker-controlled key | Explicit rejection of `__proto__`/`constructor`/`prototype` as a key before assignment; merge targets created via `Object.create(null)`                                         |
| Unhandled Promise Rejections (correctness)               | N/A — structural, not data-flow                                                       | Any `async` call or `.then()` chain with no `.catch()`, not `await`-ed inside a `try`/`catch`                                                                                          | Presence of a `.catch()` handler, or the `await` sitting inside an enclosing `try`/`catch`                                                                                      |
| IDOR / Broken Route Authorization                        | A route parameter (`req.params.id`)                                                   | A DB lookup using that parameter with no ownership/tenant-scoping filter in the same query                                                                                             | The query includes a `WHERE ... = session.userId` clause (or the ORM equivalent scoping call)                                                                                   |

### Python (FastAPI, Flask, Django)

| Class             | Source                                                                         | Sink                                                                    | Sanitizer                                                                                                |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Command Injection | `request.args`, `request.form`, `request.json`, FastAPI route/query parameters | `os.system()`, `subprocess.Popen(..., shell=True)`                      | `subprocess.run([...], shell=False)` with an argument list; `shlex.quote()` on any interpolated fragment |
| SQL Injection     | same sources                                                                   | `cursor.execute(f"...")` / `.format()` / `%`-interpolated query strings | Parameterized tuple/dict passing: `cursor.execute("... WHERE id = %s", (val,))`                          |
| SSRF              | same sources                                                                   | `requests.get(user_url)`, `httpx.get(user_url)`                         | Same URL-scheme + private-IP-range checks as JS/TS                                                       |
| Path Traversal    | same sources                                                                   | `open(user_path)`                                                       | `os.path.abspath(user_path)` + prefix check against the allowed root, after normalization                |
| Code Injection    | same sources                                                                   | `eval()`, `exec()`, `pickle.loads()` on untrusted bytes                 | None recognized — always `confirmed`                                                                     |

### Go (net/http, Gin, Fiber)

| Class             | Source                                                   | Sink                                           | Sanitizer                                                                              |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Command Injection | `c.Query()`, `c.PostForm()`, `c.Body()`, `r.URL.Query()` | `exec.Command("sh", "-c", userInput)`          | `exec.Command(binary, arg1, arg2, ...)` with no shell, each argument passed separately |
| SQL Injection     | same sources                                             | `db.Query(fmt.Sprintf("...%s...", userInput))` | Parameterized placeholders: `db.Query("... WHERE id = $1", userInput)`                 |
| SSRF              | same sources                                             | `http.Get(userURL)`                            | Same URL-scheme + private-IP-range checks                                              |
| Path Traversal    | same sources                                             | `os.Open(userPath)`                            | `filepath.Clean(userPath)` + prefix check against the allowed root                     |

### Two classes that don't fit the source→sink shape

**Unhandled Promise Rejections** is a pure AST-structural correctness check — there is no tainted value and no data flow to trace, only a shape: an async call site with neither a `.catch()` nor an enclosing `try`/`catch`. It should be implemented as its own detector kind, not shoehorned into `sources.ts`/`sinks.ts`.

**IDOR / Broken Route Authorization** requires cross-referencing two independent things — the route's authorization middleware/guard, and the query's filter clause — rather than tracing a single value along one path. It's closer to a two-part structural check ("is there a guard on this route?" + "does the query scope by the authenticated identity?") than a single taint trace, and should be implemented accordingly.

---

## A.2 ast-grep Rule Implementations (top 3, JS/TS)

Schema verified against ast-grep's current documentation (ast-grep.github.io/guide/rule-config.html and /guide/rule-config/relational-rule.html) before drafting: atomic rules (`pattern`/`kind`/`regex`), relational rules (`inside`/`has`/`precedes`/`follows`, each accepting `stopBy`), composite rules (`all`/`any`/`not`), linting-specific fields (`message`/`severity`/`note`), and code rewriting via `fix`.

Each of these rules identifies a _candidate_ — it is not itself the confirmed/discarded decision. That decision belongs to the deterministic sanitizer-filter logic in A.3, which is what the `taint-engine` pipeline actually calls after ast-grep produces a match.

### `js-command-injection-exec.yml`

```yaml
id: js-command-injection-exec
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
    - pattern: $CP.exec($CMD, $$$)
    - pattern: $CP.execSync($CMD, $$$)
constraints:
  CMD:
    not:
      any:
        - kind: string
        - kind: template_string
fix: |
  $CP.execFile($BIN, [$$$ARGS], $$$)
```

The `constraints.CMD` block excludes matches where the command argument is a plain string or template literal with no interpolation — those are author-controlled, not tainted, so flagging them would be exactly the kind of noise CLAUDE.md's "Precision & Trust Over Volume" principle rules out.

### `js-sql-injection-string-concat.yml`

```yaml
id: js-sql-injection-string-concat
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
    any:
      - kind: template_string
        has: { kind: template_substitution }
      - kind: binary_expression
        has: { pattern: "+" }
note: |
  Safe replacements: parameterized placeholders ($DB.query('...$1...', [val])),
  Prisma tagged templates ($queryRaw`...${val}...`), or knex.raw('?', [val]).
```

### `js-ssrf-unvalidated-url.yml`

```yaml
id: js-ssrf-unvalidated-url
language: TypeScript
severity: warning
message: >
  A user-controlled value reaches an outbound HTTP call (fetch/axios/http.request) with no
  visible URL-scheme/host validation on the same path — potential SSRF.
rule:
  any:
    - pattern: fetch($URL, $$$)
    - pattern: $AXIOS.get($URL, $$$)
    - pattern: $HTTP.request($URL, $$$)
constraints:
  URL:
    not:
      kind: string
note: |
  This rule flags the candidate path; the deterministic sanitizer-filter logic (A.3) then checks
  the same path for a private-IP/scheme allowlist guard before promoting to a Finding — the
  ast-grep rule alone never decides confirmed/discarded.
```

`severity` is `warning`, not `error`, unlike the other two rules: an unvalidated URL reaching an outbound call is a weaker signal on its own than string concatenation into a shell or a SQL query, since many such calls are safe by construction of the surrounding application (e.g. an internal-only service). The sanitizer-filter step is what does the real work of separating confirmed SSRF from a merely-suspicious pattern.

---

## A.3 Deterministic Sanitizer Filter Logic

This is the pseudocode `packages/core/src/taint/sanitizer-filter.ts` will implement — the piece that turns an ast-grep candidate match into an actual `Finding` status.

```ts
function resolveSanitizerStatus(
  path: CandidatePath,
): "confirmed" | "needs-verification" | "discarded" {
  const guards = findGuardsOnPath(path); // AST nodes between source and sink: if-checks, gating function calls

  for (const guard of guards) {
    const verdict = matchKnownSanitizerPattern(guard, path.sinkClass);
    if (verdict === "known-safe") return "discarded";
  }

  if (guards.length === 0) return "confirmed";

  // A guard exists but didn't match any known-safe pattern deterministically.
  // Route to the LLM triage provider — narrow, structured classification only.
  const llmVerdict = llmTriageProvider.classify(path); // DeterministicOnlyProvider -> always 'unresolved'
  if (llmVerdict === "unresolved") return "needs-verification";
  return llmVerdict.safe ? "discarded" : "confirmed";
}
```

`matchKnownSanitizerPattern(guard, sinkClass)` is a per-sink-class registry lookup in `packages/core/src/taint/sanitizers.ts`. For SSRF specifically: does the guard call a function whose own body (walked via the same tree-sitter query mechanism used everywhere else in the engine) contains a private-IP-range check, and is that function's return value what actually gates the `fetch`/`axios`/`http.request` call? This is real reachability analysis on the guard's own body, not a keyword match against the guard's name — directly implementing the Yamaguchi et al. rationale from A.0.

---

## A.4 1-Click Local PoC Probes

Non-destructive verification payloads WhoAmI sends to `localhost:<detected-port>` when the user explicitly requests verification of a `confirmed` finding. **None of these run automatically** — every probe here has a real-world side effect (an HTTP request, in one case a spawned local listener) and must be user-triggered, matching the precedent already set for TruffleHog-style live verification (opt-in only, never part of the automatic real-time scan).

| Class                 | Probe                                                                                                                                                                                                         | Success signal                                                                                                                                     | Why it's non-destructive                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SQL Injection**     | Append `' OR '1'='1` to a parameter already known to be tainted on this path; separately, send a bare `'`                                                                                                     | An HTTP 500 response, or a database-driver syntax-error string appearing in the response body                                                      | Never sends a payload that alters data — no `UPDATE`, `DROP`, `--` comment-truncation, or stacked-query payloads                                             |
| **Command Injection** | Append `; echo whoami-poc-<random-token>` (POSIX) or `& echo whoami-poc-<random-token> &` (Windows `cmd.exe`) to the tainted argument                                                                         | The response, or captured stdout if the target streams command output, contains the random token                                                   | The injected command only echoes a random marker — it does not read, write, or delete anything                                                               |
| **Path Traversal**    | Request `../../../../etc/passwd` (POSIX) or `..\..\..\..\Windows\win.ini` (Windows) as an _existence check only_ — compare status code / response size against a request for a known-nonexistent sibling path | A status-code or response-size delta between the traversal path and the nonexistent-sibling control proves the traversal escaped the intended root | The probe never renders file contents into the finding UI — existence, not content, is what's verified                                                       |
| **SSRF**              | Point the tainted URL parameter at a local, ephemeral loopback listener that WhoAmI itself starts on a random high port for the duration of the check                                                         | That listener receives the callback                                                                                                                | The whole exchange stays on `localhost` — proves the outbound request was actually issued by server-controlled code, without ever reaching the real internet |

---

## A.5 Vitest Fixture/Test Plan

For each of the 3 ast-grep-backed rules in A.2, once `packages/core` exists:

```
src/__tests__/fixtures/javascript/js-command-injection-exec/{vulnerable.ts,safe.ts}
src/__tests__/fixtures/javascript/js-sql-injection-string-concat/{vulnerable.ts,safe.ts}
src/__tests__/fixtures/javascript/js-ssrf-unvalidated-url/{vulnerable.ts,safe.ts}
```

Each `safe.ts` fixture must be structurally similar to its `vulnerable.ts` pair but pass through a real sanitizer matching the pattern registered in A.3 — this is what catches both false negatives (a real vulnerability the engine misses) and false positives (a safe pattern the engine wrongly flags), the two failure modes `CLAUDE.md` explicitly calls out. Each pair gets a matching test asserting the engine emits exactly one `confirmed` Finding for `vulnerable.ts` and zero Findings for `safe.ts` — no partial credit, no `needs-verification` result expected from either fixture (both cases are meant to be resolvable by pattern matching alone).

This is the same fixture-driven pattern the `taint-engine` skill already mandates for every future rule — this section is simply the concrete, ready-to-use fixture list for these first 3.

nmap, masscan, ffuf
