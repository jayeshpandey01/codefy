Absolutely. I would structure this as a **proper engineering + research plan**, where every known limitation becomes an explicit **edge case → detection strategy → solution → fallback → evidence**.

The goal should not be “build an LLM-free RAG.” The stronger architecture is:

> **LLM-Free Deterministic Code Intelligence Engine**
> Repository → Parser → Common IR → Code Property Graph → Data/Control/Call/Taint Analysis → Security Rules → Risk Engine → Deterministic Query Engine → Evidence → Graph + Chat UI

---

# 1. Final Architecture

```text
                         ┌─────────────────────────┐
                         │      GitHub Repository   │
                         │ Code / PR / Workflows    │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │   Repository Scanner     │
                         │ Git / File / Dependency  │
                         └────────────┬────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────┐
                  │        Language Parsing Layer       │
                  │                                    │
                  │ Tree-sitter / Language Adapters    │
                  └────────────────┬───────────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────────┐
                  │          Common Code IR             │
                  │                                    │
                  │ File / Symbol / Function / Class   │
                  │ Import / Call / Variable / Literal │
                  └────────────────┬───────────────────┘
                                   │
                                   ▼
        ┌─────────────────────────────────────────────────────┐
        │                 CODE PROPERTY GRAPH                  │
        │                                                     │
        │ AST ── CFG ── Call Graph ── DFG ── Taint Graph     │
        │      │         │             │                     │
        │      └──────────┴─────────────┴──── Dependencies   │
        └─────────────────────┬───────────────────────────────┘
                              │
              ┌───────────────┼──────────────────┐
              ▼               ▼                  ▼
       ┌────────────┐ ┌──────────────┐ ┌─────────────────┐
       │ Query      │ │ Security     │ │ Dependency     │
       │ Engine     │ │ Rule Engine  │ │ Intelligence   │
       └─────┬──────┘ └──────┬───────┘ └───────┬─────────┘
             │               │                 │
             └───────────────┼─────────────────┘
                             ▼
                    ┌──────────────────┐
                    │   Risk Engine    │
                    │ Confidence       │
                    │ Severity         │
                    │ Reachability     │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Evidence Engine  │
                    │ Source → Sink     │
                    │ Graph Path        │
                    │ Code Locations    │
                    └────────┬─────────┘
                             │
                ┌────────────┴─────────────┐
                ▼                          ▼
        ┌────────────────┐         ┌────────────────┐
        │ Chat Interface │         │ Graph UI       │
        │ Natural Query  │         │ Focus / Path   │
        └────────────────┘         └────────────────┘
```

---

# 2. The Core Design Principle

We should **not try to solve everything with one system**.

Instead:

| Problem                            | Deterministic component       |
| ---------------------------------- | ----------------------------- |
| Parse code                         | Tree-sitter                   |
| Understand syntax                  | AST                           |
| Understand execution               | CFG                           |
| Understand calls                   | Call Graph                    |
| Track values                       | DFG                           |
| Track attacks                      | Taint Graph                   |
| Understand dependencies            | Dependency Resolver           |
| Detect known vulnerabilities       | Rule Engine                   |
| Detect dataflow vulnerabilities    | Taint Rules                   |
| Query repository                   | Query DSL                     |
| Understand user question           | Intent Grammar                |
| Rank findings                      | Risk Engine                   |
| Explain findings                   | Evidence Engine               |
| External vulnerability information | OSV/GitHub/etc.               |
| Store portable knowledge           | OKF                           |
| Show result                        | Graph UI                      |
| Incremental PR analysis            | Dependency-aware invalidation |

This is what makes the architecture viable without an LLM.

---

# 3. Edge Case Matrix

This is the most important part of the plan.

---

## EDGE CASE #1 — User asks arbitrary natural-language questions

### Problem

Without an LLM:

```text
"Can you tell me where authentication could potentially break?"
```

is difficult to interpret.

### Solution

Build a **Natural Language → Query AST compiler**.

```text
User Question
     ↓
Tokenizer
     ↓
Intent Detection
     ↓
Entity Extraction
     ↓
Synonym Resolution
     ↓
Query AST
     ↓
Graph Query
```

Example:

```text
"show me all critical bugs"
```

becomes:

```json
{
  "intent": "SECURITY_FINDINGS",
  "severity": "CRITICAL"
}
```

Then:

```text
SECURITY_FINDINGS
    WHERE severity = CRITICAL
```

### Supported intents initially

```text
LIST_FILES
FIND_FUNCTION
FIND_CLASS
FIND_IMPORTS
FIND_CALLERS
FIND_CALLEES
FIND_DEPENDENCIES

SECURITY_FINDINGS
FIND_CRITICAL
FIND_HIGH_RISK

TRACE_DATAFLOW
TRACE_TAINT
TRACE_SOURCE_TO_SINK

FIND_PR_CHANGES
FIND_IMPACTED_CODE

EXPLAIN_FINDING
SHOW_GRAPH_PATH
```

### Fallback

If the sentence cannot be confidently converted:

```text
I couldn't map this question to a supported repository query.

Try:
• Show critical vulnerabilities
• Who calls authenticate()?
• What imports database.py?
• Trace user input to SQL execution
```

**Do not hallucinate an interpretation.**

---

# 4. EDGE CASE #2 — User asks something completely new

Example:

> “Is this architecture scalable?”

There may be no deterministic rule.

### Solution

Introduce:

```text
SUPPORTED
PARTIALLY_SUPPORTED
UNSUPPORTED
```

Every query gets a capability classification.

```json
{
  "query": "...",
  "status": "PARTIALLY_SUPPORTED",
  "coverage": [
    "dependency graph",
    "call graph"
  ],
  "missing": [
    "runtime performance",
    "production traffic"
  ]
}
```

This is much safer than pretending the system knows everything.

---

# 5. EDGE CASE #3 — Unknown vulnerability

This is one of the biggest limitations of an LLM-free system.

A rule engine can detect:

```text
SQL Injection
XSS
Command Injection
Path Traversal
Hardcoded Secret
SSRF
Weak Crypto
```

But what about a vulnerability nobody wrote a rule for?

### Solution: 3-layer detection

### Layer 1 — Known security rules

```text
SQL injection
XSS
SSRF
RCE
Path traversal
etc.
```

### Layer 2 — Generic source → sink analysis

Example:

```text
HTTP Request
      ↓
User Input
      ↓
Transformation
      ↓
Database Query
```

Even if the exact vulnerability is unknown, flag suspicious flow.

### Layer 3 — Graph anomalies

Look for:

```text
untrusted input
       ↓
dangerous operation
```

or:

```text
external source
       ↓
privileged operation
```

Output:

> Suspicious data flow detected.

**Not:**

> Critical vulnerability confirmed.

---

# 6. EDGE CASE #4 — False positives

Example:

```python
query = sanitize(user_input)
execute(query)
```

A naive scanner sees:

```text
user_input → execute()
```

and reports SQL injection.

### Solution

Track sanitizers.

Graph:

```text
SOURCE
  │
  ▼
SANITIZER
  │
  ▼
SINK
```

Security rule:

```yaml
rule: SQL_INJECTION

source:
  - request.parameter

sanitizer:
  - parameterized_query
  - sql_escape

sink:
  - database.execute
```

Then calculate:

```text
Risk =
Rule Confidence
× Reachability
× Data Sensitivity
× Privilege
× Exploitability
```

---

# 7. EDGE CASE #5 — Sanitization is conditional

Example:

```python
if user_is_admin:
    query = raw_input
else:
    query = sanitize(raw_input)

execute(query)
```

Simple taint analysis may incorrectly say:

```text
100% vulnerable
```

### Solution

Use **path-sensitive analysis**.

Maintain separate paths:

```text
Path A:
admin
 ↓
raw input
 ↓
execute

Path B:
normal user
 ↓
sanitize
 ↓
execute
```

Result:

```text
Potential vulnerability

Reachable when:
user_is_admin == true
```

This dramatically improves accuracy.

---

# 8. EDGE CASE #6 — Interprocedural dataflow

Example:

```python
def controller(request):
    data = request.args["id"]
    return service(data)

def service(data):
    return repository(data)

def repository(data):
    return db.execute(data)
```

The vulnerability crosses:

```text
controller
   ↓
service
   ↓
repository
```

### Solution

Build:

```text
Call Graph
+
Interprocedural DFG
+
Taint Graph
```

Result:

```text
HTTP parameter
     ↓
controller()
     ↓
service()
     ↓
repository()
     ↓
db.execute()
```

The graph itself becomes the evidence.

---

# 9. EDGE CASE #7 — Recursion

Example:

```python
def process(node):
    process(node.child)
```

Naive graph traversal can loop forever.

### Solution

Use:

```text
visited node set
maximum traversal depth
cycle detection
SCC analysis
```

Example:

```text
A → B → C → A
```

is treated as one strongly connected component.

---

# 10. EDGE CASE #8 — Dynamic dispatch

Example:

```python
handler = get_handler()
handler(data)
```

The target isn't statically obvious.

### Solution

Create:

```text
UNKNOWN_CALL
```

rather than guessing.

```text
handler()
   ↓
UNKNOWN_TARGET
```

Store:

```json
{
  "resolution": "UNKNOWN",
  "confidence": 0.32
}
```

If runtime instrumentation is available:

```text
Static:
handler → UNKNOWN

Runtime:
handler → AuthHandler.process
```

Then combine both.

---

# 11. EDGE CASE #9 — Reflection / metaprogramming

Examples:

```python
getattr(obj, method_name)
```

```javascript
obj[functionName]()
```

```java
Class.forName(...)
```

### Solution

Three levels:

### Level 1

Static constant resolution.

```python
method_name = "authenticate"
```

Resolve automatically.

### Level 2

Possible-target analysis.

```text
authenticate()
authorize()
logout()
```

### Level 3

Unknown target.

```text
DYNAMIC_CALL
```

Never silently discard it.

---

# 12. EDGE CASE #10 — Framework magic

This is extremely important.

For example:

```python
@app.get("/users")
def get_users():
```

The framework implicitly creates an HTTP endpoint.

A normal AST does not fully understand that.

### Solution

Create **Framework Semantic Adapters**.

Example:

```text
FastAPI Adapter
Flask Adapter
Django Adapter
Express Adapter
Next.js Adapter
Spring Adapter
GitHub Actions Adapter
```

They translate framework semantics into common IR.

For example:

```text
@app.get("/users")
```

becomes:

```text
HTTP_ENDPOINT
method = GET
path = /users
handler = get_users
```

---

# 13. EDGE CASE #11 — GitHub Actions

GitHub Actions deserves a **separate semantic graph**.

Do not treat YAML as ordinary code.

Model:

```text
Repository
   │
   └── Workflow
         │
         ├── Event
         ├── Job
         │    ├── Runner
         │    ├── Permissions
         │    ├── Environment
         │    ├── Secrets
         │    └── Steps
         │
         └── Dependencies
```

Then detect:

```text
untrusted PR
      ↓
workflow
      ↓
privileged token
```

or:

```text
unpinned third-party action
```

or:

```text
excessive permissions
```

or:

```text
secret exposure
```

---

# 14. EDGE CASE #12 — YAML expressions

GitHub Actions has expressions such as:

```yaml
${{ github.event.pull_request.title }}
```

Treat expressions as an AST.

```text
Expression
   ↓
Property Access
   ↓
Context
```

Then mark contexts:

```text
TRUSTED
UNTRUSTED
CONDITIONAL
UNKNOWN
```

This allows security rules to reason about them.

---

# 15. EDGE CASE #13 — Dependency vulnerabilities

Do NOT try to determine everything from source code.

Example:

```json
"lodash": "4.17.15"
```

Your graph knows:

```text
project → lodash@4.17.15
```

But it doesn't inherently know whether that version has CVE/OSV vulnerabilities.

### Solution

Dependency intelligence:

```text
Package Manager
      ↓
Package + Version
      ↓
OSV
      ↓
Advisories
      ↓
Local vulnerability database
```

Cache the results.

---

# 16. EDGE CASE #14 — Offline environment

Internet may be unavailable.

### Architecture

```text
                 ┌── Local Rules
                 ├── Local Graph
                 ├── Local Dependency DB
                 └── Local Knowledge
                       │
                       ▼
                  OFFLINE MODE
```

Then optional:

```text
              Internet Available?
                     │
              ┌──────┴──────┐
              YES           NO
               │             │
          OSV/GitHub      Local DB
```

UI should clearly say:

```text
Analysis: LOCAL
External enrichment: OFF
```

or:

```text
Analysis: LOCAL + LIVE
```

---

# 17. EDGE CASE #15 — Internet API unavailable

OSV/GitHub can fail.

Never make scanning fail because enrichment failed.

```text
Local scan
   ↓
SUCCESS
   ↓
External enrichment
   ↓
FAILED
```

Result:

```text
8 local findings

Dependency intelligence:
Unavailable

Last successful sync:
2026-09-02
```

---

# 18. EDGE CASE #16 — Dependency version ambiguity

Example:

```text
requests >= 2.20
```

You cannot always determine the exact installed version.

### Solution

Track:

```text
declared_version
resolved_version
lockfile_version
runtime_version
```

Confidence:

```text
EXACT
RESOLVED
DECLARED_ONLY
UNKNOWN
```

---

# 19. EDGE CASE #17 — Generated code

Repositories contain:

```text
generated/
dist/
build/
coverage/
node_modules/
vendor/
```

Scanning everything wastes resources and increases false positives.

### Solution

Classify files:

```text
SOURCE
GENERATED
DEPENDENCY
BUILD_OUTPUT
TEST
CONFIG
DOCUMENTATION
UNKNOWN
```

Default:

```text
SOURCE → analyze
DEPENDENCY → metadata analysis
GENERATED → reduced analysis
BUILD → ignore
```

Allow configuration overrides.

---

# 20. EDGE CASE #18 — Minified JavaScript

Example:

```text
app.min.js
```

AST becomes difficult and useless for developer navigation.

### Solution

Detect:

```text
MINIFIED
```

Then:

```text
skip detailed semantic analysis
```

unless source maps exist.

If:

```text
app.min.js
app.js.map
```

then resolve back to:

```text
original source
```

---

# 21. EDGE CASE #19 — Multiple programming languages

A repository may contain:

```text
Python
JavaScript
TypeScript
Go
Java
C++
Rust
YAML
Dockerfile
SQL
```

### Solution

Don't build separate graph architectures.

Build:

```text
Language Parser
      ↓
Language Adapter
      ↓
COMMON IR
      ↓
COMMON GRAPH
```

Example:

```text
Python AST ─┐
JS AST ─────┤
Go AST ─────┼──→ Common Code IR
Java AST ───┤
Rust AST ───┘
```

---

# 22. EDGE CASE #20 — Cross-language calls

Example:

```text
React
  ↓
REST API
  ↓
Python
  ↓
PostgreSQL
```

Traditional code graph won't necessarily connect them.

### Solution

Create boundary nodes:

```text
HTTP_REQUEST
HTTP_ENDPOINT
DATABASE_QUERY
MESSAGE_QUEUE
RPC
GRPC
```

Then connect:

```text
Frontend
   ↓
HTTP_REQUEST
   ↓
HTTP_ENDPOINT
   ↓
Python Function
```

This gives you an **application-level graph**.

---

# 23. EDGE CASE #21 — SQL embedded inside application code

Example:

```python
cursor.execute(
    "SELECT * FROM users WHERE id = " + user_id
)
```

The SQL is inside a string.

### Solution

Add language-specific embedded parsers.

```text
Python AST
     ↓
String Detection
     ↓
SQL Parser
     ↓
SQL AST
```

Graph:

```text
user_id
   ↓
SQL Query
   ↓
SELECT
   ↓
database
```

---

# 24. EDGE CASE #22 — Templates

Example:

```html
<div>{{ user.name }}</div>
```

or:

```javascript
`SELECT ${id}`
```

Treat template strings as structured expressions.

```text
Template
 ├── Static Content
 └── Dynamic Expression
```

This is extremely useful for XSS and injection detection.

---

# 25. EDGE CASE #23 — Secrets

Examples:

```text
AWS keys
API keys
JWT secrets
private keys
database passwords
```

### Solution

Multi-layer detector:

```text
Regex
+
Entropy
+
Known prefixes
+
Context
+
Assignment analysis
```

Example:

```python
API_KEY = "sk-xxxxxxxx"
```

should have higher confidence than:

```python
test = "sk-example"
```

Add:

```text
SECRET
SECRET_LIKE
TEST_SECRET
EXAMPLE_SECRET
```

---

# 26. EDGE CASE #24 — Authentication/authorization logic

This is harder than pattern matching.

Example:

```text
route
 ↓
authentication
 ↓
authorization
 ↓
resource
```

### Solution

Create semantic nodes:

```text
AUTHENTICATION
AUTHORIZATION
ROLE_CHECK
PERMISSION_CHECK
RESOURCE_ACCESS
```

Then rules:

```text
PUBLIC_ENDPOINT
      ↓
SENSITIVE_RESOURCE
```

without:

```text
AUTHENTICATION
```

→ suspicious.

---

# 27. EDGE CASE #25 — “Critical” classification

Don't do:

```text
rule == SQL_INJECTION
→ CRITICAL
```

Instead:

```text
Severity Engine
```

considers:

```text
Vulnerability type
+
Reachability
+
Data sensitivity
+
Privilege
+
Exploitability
+
Exposure
+
Attack path
```

Example:

```text
SQL injection
+
internet-facing endpoint
+
admin database
```

could become:

```text
CRITICAL
```

while:

```text
SQL-like unsafe query
+
dead code
+
test environment
```

could become:

```text
LOW / INFO
```

---

# 28. EDGE CASE #26 — Dead code

Example:

```python
def vulnerable():
    os.system(user_input)
```

but nothing calls it.

### Solution

Calculate reachability.

```text
ENTRYPOINT
   ↓
...
   ↓
vulnerable()
```

If no path:

```text
Reachability = UNKNOWN / UNREACHABLE
```

Don't automatically call it critical.

---

# 29. EDGE CASE #27 — Conditional reachability

Example:

```python
if DEBUG:
    execute(user_input)
```

### Solution

Represent condition:

```text
execute()
   │
   └── condition: DEBUG
```

Report:

```text
Potential vulnerability
Condition: DEBUG == true
```

---

# 30. EDGE CASE #28 — Environment variables

Example:

```python
if os.getenv("ENV") == "production":
```

Static scanner doesn't know the runtime value.

### Solution

Create:

```text
ENVIRONMENT_VALUE
```

with:

```text
KNOWN
UNKNOWN
DEFAULT
```

Don't assume.

---

# 31. EDGE CASE #29 — Configuration-dependent behavior

Example:

```text
config.yaml
    ↓
security setting
    ↓
application behavior
```

Parse configuration files into the graph.

Supported initially:

```text
.env
YAML
JSON
TOML
INI
Docker Compose
GitHub Actions
```

---

# 32. EDGE CASE #30 — PR analysis

This is very important for your GitHub scanner.

Don't scan only HEAD.

Create:

```text
BASE GRAPH
      +
HEAD GRAPH
      ↓
GRAPH DIFF
```

Then:

```text
Changed Nodes
     ↓
Changed Edges
     ↓
Affected Functions
     ↓
Affected Callers
     ↓
Affected Dataflows
     ↓
Security Re-analysis
```

This dramatically reduces scanning time.

---

# 33. EDGE CASE #31 — Changed code affects unchanged code

Example:

```text
PR changes:

validate_input()
```

But:

```text
process_payment()
```

uses it.

Therefore you cannot only scan changed lines.

### Solution

Dependency-aware impact analysis:

```text
Changed function
      ↓
Callers
      ↓
Callers of callers
      ↓
Affected sinks
```

Set an analysis radius:

```text
depth = 1
depth = 3
depth = unlimited
```

---

# 34. EDGE CASE #32 — Huge repositories

A million-node graph cannot be traversed for every query.

### Solution

Build indexes.

```text
Symbol Index
File Index
Call Index
Import Index
Type Index
Taint Index
Security Index
Dependency Index
```

Then:

```text
query
 ↓
index
 ↓
candidate nodes
 ↓
graph traversal
```

instead of:

```text
query
 ↓
scan entire graph
```

---

# 35. EDGE CASE #33 — Repeated scans

Don't rebuild everything.

Use:

```text
content hash
AST hash
symbol hash
dependency hash
```

Example:

```text
file unchanged
     ↓
reuse AST

function unchanged
     ↓
reuse graph

dependency unchanged
     ↓
reuse vulnerability result
```

---

# 36. EDGE CASE #34 — Parser failure

Code may be broken:

```python
def hello(
```

Tree-sitter's error-tolerant parsing helps here.

Still create:

```text
PARSE_ERROR
```

nodes.

Result:

```text
Analysis coverage: 91%

Unanalyzed:
file.py: lines 120-145
Reason: unresolved syntax
```

Never pretend the repository was completely scanned.

---

# 37. EDGE CASE #35 — Binary files

Don't try to parse everything.

Classify:

```text
SOURCE
BINARY
IMAGE
VIDEO
ARCHIVE
UNKNOWN
```

Binary files get:

```text
metadata analysis
hash
dependency/license detection
```

not AST analysis.

---

# 38. EDGE CASE #36 — Symlinks

Symlink loops can break scanners.

Example:

```text
A → B
B → A
```

### Solution

Maintain:

```text
visited inode / canonical path
```

and detect cycles.

---

# 39. EDGE CASE #37 — Monorepos

Example:

```text
/apps/frontend
/apps/backend
/packages/auth
/packages/database
```

### Solution

Create:

```text
Repository
 ├── Project
 │    ├── Package
 │    └── Package
 └── Project
```

Then analyze:

```text
project-level
package-level
repository-level
```

---

# 40. EDGE CASE #38 — Vendored dependencies

Example:

```text
/vendor/library/
```

The code belongs to the repository but isn't maintained directly.

### Solution

Tag:

```text
VENDORED_DEPENDENCY
```

Perform:

```text
dependency vulnerability analysis
```

but reduce:

```text
developer ownership score
```

---

# 41. EDGE CASE #39 — Third-party action changes

GitHub workflow:

```yaml
uses: some/action@main
```

### Solution

Detect:

```text
unpinned dependency
```

Compare:

```text
main
SHA
tag
version
```

Give higher trust to immutable SHA pinning.

---

# 42. EDGE CASE #40 — Security rule conflicts

Two rules may produce different results.

Example:

```text
Rule A → HIGH
Rule B → MEDIUM
```

### Solution

Create rule metadata:

```yaml
priority:
confidence:
severity:
category:
```

Then aggregate.

Never simply overwrite one result with another.

---

# 43. EDGE CASE #41 — Duplicate findings

Different rules can detect the same vulnerability.

Example:

```text
SQL Injection Rule
Taint Rule
Generic Sink Rule
```

### Solution

Finding fingerprint:

```text
source
sink
rule
path
```

Then deduplicate.

---

# 44. EDGE CASE #42 — Same vulnerability through multiple paths

Example:

```text
request
 ├── service A
 │      └── DB
 │
 └── service B
        └── DB
```

Don't collapse them into one meaningless result.

Store:

```text
Finding
 ├── Path 1
 └── Path 2
```

UI can show:

> 2 exploitable paths detected.

---

# 45. EDGE CASE #43 — Evidence/explanation

Because there is no LLM, you need a different explanation system.

Instead of:

> “I think this function may be vulnerable because…”

show:

```text
Finding: SQL Injection

Source:
request.args["id"]
file: api/users.py
line: 42

        ↓

Function:
get_user()

        ↓

Function:
find_user()

        ↓

Sink:
db.execute()

file: database.py
line: 87
```

This is **deterministic explainability**.

---

# 46. EDGE CASE #44 — User asks “show me where”

This is where your graph UI becomes a huge advantage.

Chat:

> Show critical vulnerabilities.

Result:

```text
3 critical findings
```

Click:

```text
Finding #1
```

Graph automatically:

```text
SOURCE
  ↓
FUNCTION
  ↓
FUNCTION
  ↓
SINK
```

and highlights:

```text
file
line
node
edge
```

So the chatbot is essentially a **graph controller**.

---

# 47. EDGE CASE #45 — User asks “why?”

Example:

> Why is this critical?

Don't generate explanation.

Build deterministic explanation:

```text
Severity = CRITICAL

Reason:
✓ Internet-facing endpoint
✓ Untrusted input
✓ Sensitive database
✓ No sanitizer
✓ Reachable
✓ Privileged operation
```

This is far more auditable than an LLM explanation.

---

# 48. EDGE CASE #46 — Confidence vs certainty

Very important.

Never show:

```text
Probability = 97%
```

unless you actually calibrated a probabilistic model.

Instead:

```text
Confidence: HIGH
Evidence: 5
Static resolution: EXACT
Dataflow: CONFIRMED
Reachability: CONFIRMED
```

Example:

```text
Confidence: HIGH

Evidence:
• exact source
• exact sink
• resolved call chain
• no sanitizer
• reachable endpoint
```

---

# 49. EDGE CASE #47 — Runtime-only behavior

Static analysis cannot see everything.

Example:

```python
module = import_module(os.getenv("PLUGIN"))
```

### Solution

Optional runtime instrumentation:

```text
STATIC GRAPH
     +
RUNTIME GRAPH
     ↓
HYBRID GRAPH
```

Tag edges:

```text
STATIC
OBSERVED
INFERRED
UNKNOWN
```

This is a very powerful research direction.

---

# 50. EDGE CASE #48 — Missing runtime information

If runtime instrumentation isn't available:

```text
Runtime evidence: unavailable
```

Don't assume:

```text
not executed
```

There is a huge difference between:

```text
NOT OBSERVED
```

and:

```text
NOT REACHABLE
```

---

# 51. EDGE CASE #49 — Security rule doesn't apply

Example:

```text
SQL injection rule
```

but the application doesn't use a database.

Don't run expensive analysis unnecessarily.

Use capability detection:

```text
Database present?
     ↓
YES → SQL rules
NO  → skip SQL rules
```

---

# 52. EDGE CASE #50 — Rule coverage

Your system should expose:

```text
Security Coverage
```

Example:

```text
Languages:
Python ✓
JavaScript ✓
Java △

Frameworks:
FastAPI ✓
Django ✓
Express △

Security:
SQL Injection ✓
XSS ✓
SSRF ✓
Unknown logic flaws ✗
```

This is critical for trust.

---

# 53. EDGE CASE #51 — “No vulnerabilities found”

Never say:

> Repository is secure.

Instead:

> **No known issues detected under the enabled analysis rules.**

Then:

```text
Rules executed: 142
Files analyzed: 3,421
Functions analyzed: 21,382
Dataflow coverage: 87%
Unresolved calls: 341
External enrichment: enabled
```

This makes the result defensible.

---

# 54. EDGE CASE #52 — Analysis incompleteness

Every scan should produce:

```json
{
  "files_total": 1000,
  "files_analyzed": 987,
  "parse_errors": 4,
  "unsupported_files": 9,
  "unresolved_calls": 341,
  "unknown_dynamic_calls": 78,
  "coverage": 0.91
}
```

This should be visible in the UI.

---

# 55. EDGE CASE #53 — Rule maintenance

Security rules will constantly evolve.

Don't hardcode them into Python.

Use:

```text
rules/
   sql_injection.yaml
   xss.yaml
   ssrf.yaml
   secrets.yaml
   github_actions.yaml
```

Example:

```yaml
id: PY-SQL-001

name: Possible SQL Injection

severity: high

sources:
  - http.request.parameter

sinks:
  - sql.execute

sanitizers:
  - parameterized_query

conditions:
  require_reachable: true
```

This lets you add rules without changing the engine.

---

# 56. EDGE CASE #54 — Rule versioning

A finding should remember which rule produced it.

```text
Rule:
PY-SQL-001

Rule Version:
1.4.0

Scanner Version:
0.8.2
```

Otherwise historical scans become impossible to compare.

---

# 57. EDGE CASE #55 — Historical comparison

User asks:

> Did security improve after this PR?

Compare:

```text
Commit A
   ↓
Security Graph A

Commit B
   ↓
Security Graph B
```

Then:

```text
NEW
FIXED
UNCHANGED
REGRESSED
```

Example:

```text
Critical:
5 → 2

High:
12 → 14

Result:
Critical improved
High regressed
```

---

# 58. EDGE CASE #56 — Graph versioning

Your graph should be commit-aware.

```text
Repository
 ├── Commit A
 ├── Commit B
 ├── Commit C
 └── Commit D
```

Or practically:

```text
graph snapshot
+
git commit SHA
```

This allows reproducibility.

---

# 59. EDGE CASE #57 — OKF

Use OKF as the **knowledge/export layer**, not the main computational graph.

Architecture:

```text
Internal CPG
     │
     ▼
Knowledge Projection
     │
     ▼
OKF
```

Export things such as:

```text
repository.md
architecture.md
security-findings.md
dependencies.md
services.md
functions/
```

with provenance.

Your internal graph remains optimized for:

```text
queries
traversals
dataflow
taint
security
```

OKF becomes:

```text
portable
human-readable
agent-readable
versionable
```

knowledge.

---

# 60. EDGE CASE #58 — Search without vectors

You don't need embeddings.

Use:

```text
Exact Search
+
BM25
+
Symbol Index
+
File Index
+
Alias/Synonym Dictionary
+
Graph Traversal
```

Example:

```text
"login"

↓
login
authenticate
signin
sign_in
auth
```

Then combine lexical search with graph relationships.

This is essentially:

> **Graph + lexical retrieval**

rather than:

> Vector RAG.

---

# 61. EDGE CASE #59 — Ambiguous names

Example:

```text
process()
```

There could be 40 functions called `process`.

### Solution

Return candidates:

```text
process()

1. src/auth/service.py
2. src/payment/service.py
3. src/parser/core.py
```

Ask user to select, or rank using:

```text
file context
call relationships
language
scope
```

No guessing.

---

# 62. EDGE CASE #60 — Natural-language synonym problem

Create a domain vocabulary:

```text
bug
→ vulnerability
→ issue
→ security issue

caller
→ calls
→ invokes
→ references

dependency
→ package
→ library
→ module

critical
→ critical severity
→ P0
```

Maintain this as configuration.

---

# 63. The Final Query Pipeline

This should become one of your major architectural components.

```text
User Question

"show critical bugs related to authentication"
             │
             ▼
      Tokenizer
             │
             ▼
   Intent Recognition
             │
             ▼
      Entity Resolver
             │
             ▼
        Query AST
             │
             ▼
       Query Planner
             │
       ┌─────┴─────┐
       ▼           ▼
 Security       Graph
 Rules          Traversal
       │           │
       └─────┬─────┘
             ▼
       Result Ranking
             │
             ▼
       Evidence Paths
             │
       ┌─────┴─────┐
       ▼           ▼
      Chat        Graph
```

---

# 64. The Four Query Types

I recommend explicitly designing around four categories.

### Type A — Retrieval

```text
Show all Python files
Show functions named authenticate
Show dependencies
```

Very easy.

### Type B — Relationship

```text
Who calls authenticate()?
What imports database.py?
Which functions depend on config.py?
```

Graph traversal.

### Type C — Security

```text
Show critical vulnerabilities
Find SQL injection
Find secrets
Find unsafe GitHub Actions
```

Rule + graph + taint.

### Type D — Investigation

```text
Why is this critical?
How does this input reach the database?
What changed in this vulnerability between PRs?
```

Graph path + evidence engine.

**Type D is where your product can become particularly interesting.**

---

# 65. Recommended Internal Data Model

At minimum:

```text
Repository
File
Module
Class
Function
Method
Variable
Parameter
Import
Call
Return
Literal
Expression

Endpoint
Database
Queue
ExternalService

Source
Sink
Sanitizer
Taint
Finding

Dependency
Package
Version
Advisory

Workflow
Job
Step
Permission
Secret
Runner
Event

Commit
Branch
PullRequest
```

---

# 66. Edge Types

Your screenshot's existing:

```text
imports
defines
calls
```

should expand into:

```text
IMPORTS
DEFINES
CALLS
CALLED_BY

READS
WRITES
ASSIGNS
RETURNS
PASSES_TO

CONTROLS
BRANCHES_TO
FLOWS_TO

TAINTS
SANITIZES
REACHES

DEPENDS_ON
USES
EXPOSES

TRIGGERS
CONTAINS
RUNS
AUTHORIZES

MODIFIED_BY
INTRODUCED_BY
```

This is what transforms the visualization into a **security/code intelligence graph**.

---

# 67. Finding Schema

Every finding should have something like:

```json
{
  "id": "F-10291",
  "rule_id": "PY-SQL-001",

  "severity": "CRITICAL",
  "confidence": "HIGH",

  "source": {
    "node": "request.args.id",
    "file": "api/users.py",
    "line": 42
  },

  "sink": {
    "node": "db.execute",
    "file": "database.py",
    "line": 87
  },

  "path": [
    "request.args.id",
    "get_user",
    "find_user",
    "db.execute"
  ],

  "reachability": "CONFIRMED",

  "sanitizers": [],

  "external_evidence": [],

  "rule_version": "1.2.0",

  "commit": "abc123"
}
```

This is extremely valuable for your UI.

---

# 68. Confidence Model

Instead of a black-box confidence score:

```text
Confidence
```

should be explainable:

```text
Resolution:
EXACT

Call graph:
CONFIRMED

Dataflow:
CONFIRMED

Taint:
CONFIRMED

Reachability:
CONFIRMED

Sanitization:
NOT_FOUND

External evidence:
OSV MATCH
```

Then:

```text
Confidence = HIGH
```

---

# 69. Risk Model

Keep this separate from confidence.

### Confidence

> “How confident are we that our analysis is correct?”

### Risk

> “How dangerous is the finding if correct?”

Example:

```text
Confidence = HIGH
Risk = MEDIUM
```

is completely valid.

---

# 70. Implementation Roadmap

Don't build everything simultaneously.

## Phase 0 — Architecture

**Goal:** establish data model.

Build:

```text
Repository
File
Symbol
Function
Import
Call
Commit
Finding
```

---

## Phase 1 — Scanner

Implement:

```text
GitHub clone
file discovery
file classification
hashing
incremental scanning
```

Output:

```text
Repository → Files
```

---

# Phase 2 — Parser

Start with only:

```text
Python
JavaScript
TypeScript
YAML
JSON
```

Use Tree-sitter.

Generate:

```text
AST
```

---

# Phase 3 — Common IR

Convert language-specific ASTs into:

```text
Common Code IR
```

This is one of the most important research components.

---

# Phase 4 — Graph

Implement:

```text
AST Graph
Import Graph
Symbol Graph
Call Graph
```

Your current graph UI can start becoming useful here.

---

# Phase 5 — Dataflow

Add:

```text
CFG
DFG
```

Then:

```text
variable → variable
parameter → argument
return → caller
```

---

# Phase 6 — Taint Analysis

Implement:

```text
SOURCE
TRANSFORM
SANITIZER
SINK
```

Start with:

```text
SQL Injection
XSS
Command Injection
Path Traversal
SSRF
```

---

# Phase 7 — Security Rule Engine

Build YAML rule format.

```text
rules/
├── python/
├── javascript/
├── github-actions/
├── generic/
└── dependency/
```

---

# Phase 8 — Risk Engine

Implement:

```text
severity
reachability
confidence
data sensitivity
privilege
exposure
```

---

# Phase 9 — Query Engine

Implement deterministic DSL:

```text
FIND FUNCTION authenticate
CALLERS authenticate
IMPORTERS database.py
FIND FINDING severity=critical
TRACE user_input → database
```

---

# Phase 10 — Natural Language Layer

Only after DSL works.

Build:

```text
NL
 ↓
Intent
 ↓
Query AST
 ↓
DSL
```

This is important:

> **Don't start with natural language. Start with deterministic queries.**

---

# Phase 11 — Evidence Engine

Every finding should generate:

```text
source
→ transformation
→ function
→ function
→ sink
```

Then connect this directly to your graph UI.

---

# Phase 12 — GitHub Actions Intelligence

Build dedicated parser + graph.

Support:

```text
workflow
event
job
step
permissions
secrets
runner
environment
third-party actions
expressions
```

---

# Phase 13 — Dependency Intelligence

Integrate:

```text
package.json
package-lock.json
requirements.txt
poetry.lock
pom.xml
go.mod
Cargo.lock
```

Then external advisory enrichment.

---

# Phase 14 — PR Intelligence

Implement:

```text
BASE
HEAD
 ↓
Graph Diff
 ↓
Affected Subgraph
 ↓
Security Re-analysis
```

Output:

```text
NEW FINDING
FIXED FINDING
REGRESSION
UNCHANGED
```

---

# Phase 15 — Runtime Optional Layer

Later:

```text
Static Graph
+
Runtime Graph
```

This should be optional rather than mandatory.

---

# Phase 16 — OKF Export

Finally:

```text
Internal Knowledge
        ↓
OKF Projection
        ↓
Portable Repository Knowledge
```

---

# 71. What NOT to Build Initially

This is equally important.

Don't initially attempt:

❌ All programming languages
❌ Full semantic understanding of every framework
❌ Perfect natural-language understanding
❌ Automatic vulnerability discovery of unknown classes
❌ Complete runtime behavior prediction
❌ Automatic proof that code is secure
❌ Full inter-language semantic analysis
❌ Every GitHub Actions feature
❌ Every dependency ecosystem

Instead:

```text
Python
JavaScript
TypeScript
GitHub Actions
```

first.

---

# 72. Recommended MVP

Your first serious MVP could support:

### Languages

```text
Python
JavaScript
TypeScript
```

### Git

```text
Repository
Commit
PR
Diff
```

### Graph

```text
AST
Imports
Definitions
Calls
CFG
DFG
```

### Security

```text
SQL Injection
XSS
Command Injection
Path Traversal
SSRF
Hardcoded Secrets
```

### GitHub Actions

```text
permissions
untrusted PR
secrets
unpinned actions
dangerous expressions
```

### Query

```text
Show critical findings
Find function X
Who calls X?
What does X call?
Trace input → sink
Show changed security findings
```

### UI

```text
Chat
+
Graph
+
Code viewer
+
Finding panel
```

That is already a **very strong product/research prototype**.

---

# 73. The Most Important Research Contribution

If you're turning this into a research project, I wouldn't frame the contribution as:

> “We created a vulnerability scanner without an LLM.”

That's relatively weak.

I'd frame it as:

> **A deterministic, evidence-backed code intelligence architecture that combines code property graphs, interprocedural dataflow, taint analysis, security rules, dependency intelligence, and graph-native natural-language querying without relying on large language models.**

Then your research questions become:

### RQ1

Can deterministic query compilation provide useful natural-language repository interaction without LLMs?

### RQ2

Can a unified code graph provide accurate cross-function security reasoning?

### RQ3

How much can false positives be reduced using reachability + dataflow + sanitization?

### RQ4

Can incremental graph analysis significantly reduce PR scanning cost?

### RQ5

Can evidence-path explanations improve auditability compared with generated explanations?

### RQ6

How effectively can GitHub Actions be modeled as a security graph?

### RQ7

How does the approach compare with:

```text
regex scanner
traditional SAST
CodeQL/Joern-style analysis
LLM-based code security analysis
```

---

# 74. Your Benchmark Should Measure

Don't only measure accuracy.

Measure:

| Metric                  | Why                            |
| ----------------------- | ------------------------------ |
| Precision               | False positives                |
| Recall                  | Missed vulnerabilities         |
| F1                      | Overall detection              |
| Query accuracy          | Natural-language query mapping |
| Graph resolution        | Correct call/dataflow links    |
| Analysis coverage       | How much code was understood   |
| Scan time               | Performance                    |
| Incremental scan time   | PR performance                 |
| Memory                  | Scalability                    |
| Evidence correctness    | Explainability                 |
| False-positive rate     | Developer trust                |
| Unknown resolution rate | Dynamic code limitation        |

---

# 75. Final Product Architecture

Ultimately I would target this:

```text
                         USER
                          │
                          ▼
                 ┌─────────────────┐
                 │   CHAT / QUERY  │
                 └────────┬────────┘
                          │
                Deterministic NLP
                          │
                          ▼
                 ┌─────────────────┐
                 │   QUERY ENGINE  │
                 └────────┬────────┘
                          │
                          ▼
        ┌────────────────────────────────┐
        │        CODE INTELLIGENCE       │
        │                                │
        │  AST                           │
        │  CFG                           │
        │  CALL GRAPH                    │
        │  DFG                           │
        │  TAINT GRAPH                   │
        │  DEPENDENCY GRAPH              │
        │  GITHUB ACTIONS GRAPH          │
        └────────────────┬───────────────┘
                         │
             ┌───────────┼────────────┐
             ▼           ▼            ▼
          Security    Dependency    Git/PR
           Rules      Intelligence  Analysis
             │           │            │
             └───────────┼────────────┘
                         ▼
                  ┌──────────────┐
                  │ RISK ENGINE  │
                  └──────┬───────┘
                         ▼
                  ┌──────────────┐
                  │   EVIDENCE   │
                  │ Source→Sink  │
                  └──────┬───────┘
                         │
               ┌─────────┴──────────┐
               ▼                    ▼
          ┌─────────┐          ┌─────────┐
          │  CHAT   │          │  GRAPH  │
          └─────────┘          └─────────┘
                                   │
                                   ▼
                             CODE EDITOR
```

---

## The key strategy

The biggest takeaway is this:

**Don't try to make one deterministic system behave like an LLM.**

Instead, replace the different things an LLM would normally do with specialized deterministic components:

```text
LLM reasoning
     ↓
────────────────────────────────
Parser
Resolver
Query Compiler
CPG
CFG
DFG
Call Graph
Taint Engine
Security Rules
Framework Semantics
Dependency Intelligence
Risk Engine
Evidence Engine
────────────────────────────────
```

That makes the system **less magical but much more auditable**.

And for your particular graph UI, the killer feature should be:

> **Every chatbot answer must correspond to an actual graph query and every security claim must have a navigable evidence path back to exact code.**

So if the user asks:

> **“Give me all critical bugs.”**

the system should not generate an answer from memory.

It should execute:

```text
SECURITY_FINDINGS
WHERE severity = CRITICAL
```

and return:

```text
3 Critical Findings

┌──────────────────────────────────────┐
│ F-10291  SQL Injection               │
│ HIGH confidence                      │
│ api/users.py:42 → database.py:87     │
│                                      │
│ [Show Path] [Open Code]              │
└──────────────────────────────────────┘
```

Click **Show Path** → your existing graph automatically focuses:

```text
HTTP REQUEST
     ↓
request.args["id"]
     ↓
get_user()
     ↓
find_user()
     ↓
db.execute()
```

That is the part that can make your project genuinely different from a conventional chatbot/RAG scanner.
