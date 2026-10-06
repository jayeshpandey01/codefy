# SAST API Reference: Joern CPG, Semgrep & TruffleHog

Complete request and response documentation for the **Static Application Security Testing (SAST)** and **Secret Detection** endpoints of the Authorized Scan Orchestrator API.

- **Production API Base**: `https://sast-dutn.onrender.com`
- **Swagger / OpenAPI UI**: [`https://sast-dutn.onrender.com/docs`](https://sast-dutn.onrender.com/docs)
- **Tag**: `SAST Scans (Joern CPG, Semgrep & TruffleHog)`

---

## Authentication & Headers

Production SAST endpoints require an OIDC access token issued for the Axiom API. The token must contain the configured operator or admin role; operator requests are scoped to targets owned by the token's `sub` claim. Shared `API_KEY` / `ADMIN_API_KEY` credentials are not used by released clients. `X-API-Key` is supported only when running Axiom locally in non-production `AUTH_MODE=api_key` mode.

```http
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Content-Type: application/json
Accept: application/json
```

---

## 1. List Available SAST Profiles

Retrieve supported SAST engines, language capabilities, and static analysis bundles.

### Request

```http
GET /v1/sast/profiles HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Accept: application/json
```

### Response (`200 OK`)

```json
{
  "sast_profiles": [
    {
      "profile": "sast-joern",
      "engine": "Joern CPG",
      "languages": [
        "C",
        "C++",
        "Java",
        "Kotlin",
        "JavaScript",
        "TypeScript",
        "Python",
        "Go",
        "PHP",
        "Binary/LLVM"
      ],
      "capabilities": [
        "AST/CFG/PDG graph queries",
        "Inter-procedural taint analysis",
        "Fuzzy build-free parsing",
        "Pre-scan directory filtering"
      ],
      "purpose": "Static application security testing and dataflow vulnerability discovery via Code Property Graphs"
    },
    {
      "profile": "sast-semgrep",
      "engine": "Semgrep",
      "languages": [
        "Python",
        "JavaScript",
        "TypeScript",
        "Java",
        "Go",
        "C",
        "C++",
        "Ruby",
        "PHP",
        "Rust",
        "Dockerfile",
        "Terraform"
      ],
      "capabilities": [
        "Fast semantic pattern matching",
        "OWASP Top 10 & CWE rule packs",
        "Hardcoded secrets detection",
        "Multi-language framework security audits"
      ],
      "purpose": "High-speed semantic AST pattern matching and comprehensive vulnerability rule scanning"
    },
    {
      "profile": "sast-trufflehog",
      "engine": "TruffleHog",
      "languages": [
        "All Languages",
        "Configuration Files",
        "Git History",
        "Environment Files"
      ],
      "capabilities": [
        "800+ secret detectors",
        "Active live credential verification",
        "High-entropy key analysis",
        "Safe secret masking & redaction"
      ],
      "purpose": "Automated secret scanning and live API key/credential leak verification"
    }
  ]
}
```

---

## 2. Queue SAST Code Analysis Job

Submit an authorized source repository target for SAST analysis.

### Request: Semgrep Scan (`sast-semgrep`)

```http
POST /v1/sast/scans HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Content-Type: application/json

{
  "target_id": "c2cb5aeb-4b55-47c7-b9d8-5b8650b5b902",
  "profile": "sast-semgrep"
}
```

### Request: TruffleHog Secret Scan (`sast-trufflehog`)

```http
POST /v1/sast/scans HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Content-Type: application/json

{
  "target_id": "c2cb5aeb-4b55-47c7-b9d8-5b8650b5b902",
  "profile": "sast-trufflehog"
}
```

### Request: Joern CPG Taint Scan (`sast-joern`)

```http
POST /v1/sast/scans HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Content-Type: application/json

{
  "target_id": "c2cb5aeb-4b55-47c7-b9d8-5b8650b5b902",
  "profile": "sast-joern"
}
```

### Response (`202 Accepted`)

```json
{
  "id": "70184604-f02e-4b3c-ac6a-26a2f435d298",
  "target_id": "c2cb5aeb-4b55-47c7-b9d8-5b8650b5b902",
  "profile": "sast-semgrep",
  "status": "queued",
  "failure_reason": null,
  "created_at": "2026-09-03T07:43:33.656000Z",
  "updated_at": "2026-09-03T07:43:33.656000Z"
}
```

---

## 3. Get SAST Scan Status

Check the real-time execution status of an active or completed SAST job.

### Request

```http
GET /v1/sast/scans/70184604-f02e-4b3c-ac6a-26a2f435d298 HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Accept: application/json
```

### Response (`200 OK`)

```json
{
  "id": "70184604-f02e-4b3c-ac6a-26a2f435d298",
  "target_id": "c2cb5aeb-4b55-47c7-b9d8-5b8650b5b902",
  "profile": "sast-semgrep",
  "status": "completed",
  "failure_reason": null,
  "created_at": "2026-09-03T07:43:33.656000Z",
  "updated_at": "2026-09-03T07:43:46.359000Z"
}
```

---

## 4. Cancel SAST Scan

Cancel an in-progress or queued static analysis job and release scanner resources.

### Request

```http
POST /v1/sast/scans/70184604-f02e-4b3c-ac6a-26a2f435d298/cancel HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Content-Type: application/json
```

### Response (`200 OK`)

```json
{
  "id": "70184604-f02e-4b3c-ac6a-26a2f435d298",
  "target_id": "c2cb5aeb-4b55-47c7-b9d8-5b8650b5b902",
  "profile": "sast-semgrep",
  "status": "cancelled",
  "failure_reason": null,
  "created_at": "2026-09-03T07:43:33.656000Z",
  "updated_at": "2026-09-03T07:43:40.120000Z"
}
```

---

## 5. Get SAST Scan Results

Retrieve normalized vulnerability findings, line numbers, code snippets, and remediation guidance.

### Request

```http
GET /v1/sast/scans/70184604-f02e-4b3c-ac6a-26a2f435d298/result HTTP/1.1
Host: sast-dutn.onrender.com
Authorization: Bearer <OIDC_ACCESS_TOKEN>
Accept: application/json
```

---

### Response: Semgrep Scan Result (`200 OK`)

```json
{
  "id": "70184604-f02e-4b3c-ac6a-26a2f435d298",
  "scan_job_id": "70184604-f02e-4b3c-ac6a-26a2f435d298",
  "created_at": "2026-09-03T07:43:46.359000Z",
  "artifact": null,
  "error_logs": null,
  "summary": {
    "risk_summary": {
      "critical": 3,
      "high": 4,
      "medium": 2,
      "low": 0,
      "info": 0,
      "total": 9
    },
    "scanned_files_count": 3,
    "total_rules_evaluated": 9,
    "findings": [
      {
        "id": "SEC-001",
        "code": "SEMGREP_PYTHON_FLASK_SECURITY_SQLI_RAW_SQL",
        "severity": "CRITICAL",
        "title": "SQL Injection in User Query Handler",
        "description": "User-controlled data from request is directly formatted into SQL query without parameterization.",
        "evidence": {
          "location": "test_sample_app/main.py:18:5",
          "file": "test_sample_app/main.py",
          "line": 18,
          "column": 5,
          "snippet": "query = f\"SELECT id, username, email FROM users WHERE id = '{user_id}'\"",
          "check_id": "python.flask.security.sqli.raw-sql",
          "cwe": ["CWE-89: SQL Injection"],
          "owasp": ["A03:2021 - Injection"]
        },
        "remediation": "Use parameterized queries or ORM abstractions instead of concatenating raw user input into SQL queries."
      },
      {
        "id": "SEC-002",
        "code": "SEMGREP_PYTHON_LANG_SECURITY_SYSTEM_CALL",
        "severity": "CRITICAL",
        "title": "OS Command Injection via os.system",
        "description": "Request data detected in os.system. This could allow a malicious actor to execute arbitrary commands.",
        "evidence": {
          "location": "test_sample_app/main.py:26:5",
          "file": "test_sample_app/main.py",
          "line": 26,
          "column": 5,
          "snippet": "os.system(cmd)",
          "check_id": "python.lang.security.audit.dangerous-system-call",
          "cwe": ["CWE-78: OS Command Injection"],
          "owasp": ["A03:2021 - Injection"]
        },
        "remediation": "Avoid executing dynamic shell commands. Use subprocess with argument lists and shell=False."
      },
      {
        "id": "SEC-003",
        "code": "SEMGREP_GENERIC_SECRETS_HARDCODED_JWT_SECRET",
        "severity": "HIGH",
        "title": "Hardcoded JWT Secret Disclosed",
        "description": "Hardcoded JWT secret or private key is used.",
        "evidence": {
          "location": "test_sample_app/auth.py:13:13",
          "file": "test_sample_app/auth.py",
          "line": 13,
          "column": 13,
          "snippet": "JWT_SECRET_KEY = \"super_secret_jwt_signing_key_12345\"",
          "check_id": "generic.secrets.security.detected-hardcoded-secret",
          "cwe": ["CWE-798: Use of Hard-coded Credentials"],
          "owasp": ["A07:2021 - Identification and Authentication Failures"]
        },
        "remediation": "Store secrets, API keys, and credentials in environment variables or a dedicated secrets manager."
      },
      {
        "id": "SEC-004",
        "code": "SEMGREP_PYTHON_LANG_SECURITY_INSECURE_HASH",
        "severity": "MEDIUM",
        "title": "Insecure Cryptographic Hash Algorithm (MD5)",
        "description": "MD5 is used as a password hash. MD5 is not collision-resistant and should not be used for authentication.",
        "evidence": {
          "location": "test_sample_app/auth.py:9:12",
          "file": "test_sample_app/auth.py",
          "line": 9,
          "column": 12,
          "snippet": "return hashlib.md5(password.encode()).hexdigest()",
          "check_id": "python.lang.security.insecure-hash-algorithms",
          "cwe": ["CWE-327: Use of a Broken or Risky Cryptographic Algorithm"],
          "owasp": ["A02:2021 - Cryptographic Failures"]
        },
        "remediation": "Replace weak cryptographic algorithms (MD5, SHA1) with modern standards (Argon2id, bcrypt, or PBKDF2)."
      }
    ]
  }
}
```

---

### Response: TruffleHog Secret Scan Result (`200 OK`)

```json
{
  "id": "6da05db6-8163-4a2e-af52-76c21e6a1321",
  "scan_job_id": "6da05db6-8163-4a2e-af52-76c21e6a1321",
  "created_at": "2026-09-03T07:43:55.641000Z",
  "artifact": null,
  "error_logs": null,
  "summary": {
    "risk_summary": {
      "critical": 0,
      "high": 2,
      "medium": 0,
      "low": 0,
      "info": 0,
      "total": 2
    },
    "scanned_files_count": 2,
    "total_rules_evaluated": 2,
    "findings": [
      {
        "id": "SEC-001",
        "code": "TRUFFLEHOG_GITHUB",
        "severity": "HIGH",
        "title": "Potential Leaked Github Secret Detected",
        "description": "Potential Leaked Github credential discovered in source file 'test_sample_app/config.py'. Redacted secret: <REDACTED>",
        "evidence": {
          "location": "test_sample_app/config.py:11",
          "file": "test_sample_app/config.py",
          "line": 11,
          "detector": "Github",
          "verified": false,
          "redacted_secret": "<REDACTED>"
        },
        "remediation": "Revoke the exposed GitHub token or SSH key immediately in GitHub Developer Settings and inspect repository audit logs for unauthorized access."
      },
      {
        "id": "SEC-002",
        "code": "TRUFFLEHOG_SLACKWEBHOOK",
        "severity": "HIGH",
        "title": "Potential Leaked SlackWebhook Secret Detected",
        "description": "Potential Leaked SlackWebhook credential discovered in source file 'test_sample_app/config.py'. Redacted secret: <REDACTED>",
        "evidence": {
          "location": "test_sample_app/config.py:12",
          "file": "test_sample_app/config.py",
          "line": 12,
          "detector": "SlackWebhook",
          "verified": false,
          "redacted_secret": "<REDACTED>"
        },
        "remediation": "Revoke the exposed webhook URL or bot token immediately in the application integration settings and re-generate a new token."
      }
    ]
  }
}
```

---

### Response: Joern CPG Taint Scan Result (`200 OK`)

```json
{
  "id": "cdd97073-cf42-4e0f-8cb3-ef6922b0d4d9",
  "scan_job_id": "cdd97073-cf42-4e0f-8cb3-ef6922b0d4d9",
  "created_at": "2026-09-03T07:43:58.626000Z",
  "artifact": null,
  "error_logs": null,
  "summary": {
    "risk_summary": {
      "critical": 1,
      "high": 1,
      "medium": 1,
      "low": 0,
      "info": 0,
      "total": 3
    },
    "scanned_files_count": 2,
    "total_rules_evaluated": 3,
    "findings": [
      {
        "id": "SEC-001",
        "code": "JOERN_CPG_SQLI_TAINT",
        "severity": "CRITICAL",
        "title": "SQL Injection in /api/user Request Handler",
        "description": "HTTP GET parameter 'id' reaches SQL query execution sink without parameterization.",
        "evidence": {
          "location": "test_sample_app/main.py:17 (get_user)",
          "file": "test_sample_app/main.py",
          "line": 17,
          "function": "get_user",
          "snippet": "query = f\"SELECT id, username, email FROM users WHERE id = '{user_id}'\"",
          "flow": [
            {
              "step": 1,
              "location": "test_sample_app/main.py:12",
              "variable": "user_id",
              "type": "Source (request.args.get)"
            },
            {
              "step": 2,
              "location": "test_sample_app/main.py:17",
              "variable": "query",
              "type": "Taint Propagation (f-string interpolation)"
            },
            {
              "step": 3,
              "location": "test_sample_app/main.py:18",
              "variable": "cursor.execute",
              "type": "Sink (SQL Execution Engine)"
            }
          ]
        },
        "remediation": "Use parameterized queries or ORM abstractions instead of concatenating raw user input into SQL queries."
      },
      {
        "id": "SEC-002",
        "code": "JOERN_CPG_COMMAND_INJECTION",
        "severity": "HIGH",
        "title": "OS Command Injection in /api/system/ping Endpoint",
        "description": "User JSON parameter 'host' passed directly to os.system shell execution context.",
        "evidence": {
          "location": "test_sample_app/main.py:26 (ping_host)",
          "file": "test_sample_app/main.py",
          "line": 26,
          "function": "ping_host",
          "snippet": "os.system(cmd)",
          "flow": [
            {
              "step": 1,
              "location": "test_sample_app/main.py:23",
              "variable": "host",
              "type": "Source (request.json.get)"
            },
            {
              "step": 2,
              "location": "test_sample_app/main.py:25",
              "variable": "cmd",
              "type": "Taint Propagation (f-string interpolation)"
            },
            {
              "step": 3,
              "location": "test_sample_app/main.py:26",
              "variable": "os.system",
              "type": "Sink (Shell Execution Context)"
            }
          ]
        },
        "remediation": "Avoid executing dynamic shell commands. Use subprocess with argument lists and shell=False."
      },
      {
        "id": "SEC-003",
        "code": "JOERN_CPG_WEAK_CRYPTO_MD5",
        "severity": "MEDIUM",
        "title": "Insecure Cryptographic Hash Algorithm (MD5)",
        "description": "Weak MD5 algorithm utilized for password hashing.",
        "evidence": {
          "location": "test_sample_app/auth.py:8 (hash_password)",
          "file": "test_sample_app/auth.py",
          "line": 8,
          "function": "hash_password",
          "snippet": "return hashlib.md5(password.encode()).hexdigest()"
        },
        "remediation": "Replace weak cryptographic algorithms (MD5, SHA1) with modern standards (SHA-256, AES-GCM, Argon2/bcrypt for passwords)."
      }
    ]
  }
}
```

---

### Response: In-Progress Scan State (`409 Conflict`)

If results are requested before the scanner agent completes analysis:

```json
{
  "detail": "scan is still processing"
}
```

---

### Response: Failed Scan Diagnostic Result (`200 OK`)

If the scan fails due to invalid repository inputs, missing permissions, or execution timeouts, the error is surfaced in `error_logs`:

```json
{
  "id": "d9dfdbba-180c-4827-9291-9afc576c9170",
  "scan_job_id": "d9dfdbba-180c-4827-9291-9afc576c9170",
  "created_at": "2026-09-03T07:40:43.705000Z",
  "artifact": null,
  "error_logs": "Repository clone timeout: git clone failed with exit code 128",
  "summary": {
    "status": "failed"
  }
}
```
