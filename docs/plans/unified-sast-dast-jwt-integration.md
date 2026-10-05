# Unified SAST & DAST Integration via Shared JWT Architecture

**Status:** Proposed & Planned  
**Target Services:**
- **Central Auth & AI Gateway:** `https://cmd-d-llm.vercel.app` (Fast, serverless Vercel edge)
- **Codefy SAST Microservice:** `https://sast-dutn.onrender.com` (25 zero-compile engines)
- **Codefy DAST Microservice:** `https://dast-dutn.onrender.com` (30 dynamic scanning tools)
- **Desktop Application:** Tauri v2 (`apps/desktop-app`)
- **VS Code Extension:** `codefy-whoami` (`apps/vscode-extension`)

---

## 1. Executive Summary & Architectural Overview

The Codefy security ecosystem has been upgraded to a decoupled, microservice-based architecture powered by a **unified JWT authentication model**. 

Under this upgraded model:
1. **Single Sign-On (SSO):** Developers log in once via the Central Auth Gateway at `https://cmd-d-llm.vercel.app` (or through the forwarded `/v1/auth/login` proxy).
2. **Universal Access Token:** The issued stateless JWT (`HS256`, 30-minute validity with refresh/session support) grants authenticated access to both **Codefy SAST** (`https://sast-dutn.onrender.com`) and **Codefy DAST** (`https://dast-dutn.onrender.com`).
3. **Zero Token Swapping:** The desktop application and VS Code extension use the same Bearer token across all scan invocations, live job streams, SARIF exports, and autofix patches.

```
                          ┌─────────────────────────────────────┐
                          │     Central Auth & AI Gateway       │
                          │   https://cmd-d-llm.vercel.app      │
                          │    /developer/auth/* & /api/*       │
                          └──────────────────┬──────────────────┘
                                             │
                         Issues Single JWT   │
                         (HS256 Bearer)      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Codefy Client Layer (Monorepo)                            │
│                                                                                 │
│   ┌───────────────────────────────┐     ┌───────────────────────────────────┐   │
│   │   VS Code Extension Host      │     │      Desktop App (Tauri v2)       │   │
│   │   (@whoami/vscode-extension)  │     │      (@whoami/desktop-app)        │   │
│   └───────────────┬───────────────┘     └─────────────────┬─────────────────┘   │
│                   │                                       │                     │
│                   └───────────────────┬───────────────────┘                     │
│                                       ▼                                         │
│                      Shared Security Orchestrator Client                        │
│                           (@whoami/core / types / ui)                           │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┴────────────────────────────┐
           │ Authorization: Bearer <jwt>                             │ Authorization: Bearer <jwt>
           ▼                                                         ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐
│        Codefy SAST Microservice       │ │        Codefy DAST Microservice       │
│     https://sast-dutn.onrender.com    │ │     https://dast-dutn.onrender.com    │
│  ───────────────────────────────────  │ │  ───────────────────────────────────  │
│  • 25 Zero-Compile SAST/SCA Engines   │ │  • 30 Dynamic Security Engines        │
│  • Multipart ZIP / Direct SHA-256     │ │  • Zero-Trust SSRF Guardrail          │
│  • Public & Private GitHub Repos      │ │  • Passive Recon & Active Fuzzing     │
│  • Real-time SSE /v1/jobs/{id}/stream │ │  • Real-time SSE /v1/jobs/{id}/stream │
│  • OASIS SARIF v2.1.0 & Git Patches   │ │  • OASIS SARIF v2.1.0 Export          │
└───────────────────────────────────────┘ └───────────────────────────────────────┘
```

---

## 2. Microservice Specifications & Capabilities

### 2.1 Central Auth Gateway (`https://cmd-d-llm.vercel.app`)
- **Base Endpoints:**
  - `POST /developer/auth/login`: Authenticates developer, returns JWT session (`access_token`, `user_id`, `email`, `tier`).
  - `POST /developer/auth/register`: Developer sign-up with optional language preference.
  - `GET /developer/auth/me`: Verifies active session token, returns user profile & tier.
  - `POST /developer/auth/verify-email`: Two-phase email verification.
  - `POST /developer/auth/forgot-password` & `POST /developer/auth/verify-reset-otp` & `POST /developer/auth/reset-password`: Self-service recovery flow.
  - `POST /api/query` & `/v1/chat/completions`: AI graph and vulnerability explanation inference.

### 2.2 Codefy SAST Microservice (`https://sast-dutn.onrender.com`)
- **Authentication:** `Authorization: Bearer <jwt_access_token>`. Validates JWT via local cryptographic decode or remote lookup to `cmd-d-llm` cached in Redis.
- **Engine Fleet (25 Tools):**
  - **Core SAST:** Semgrep, Bearer, Bandit, ESLint Security, njsscan, PMD, GoSec, Brakeman, Flawfinder, Cppcheck.
  - **Secrets:** Gitleaks, TruffleHog, Detect-Secrets.
  - **SCA & Containers:** Trivy, OSV-Scanner, pip-audit, Syft (SBOM).
  - **IaC & Workflows:** Checkov, KICS, Hadolint, Zizmor.
  - **Specialized:** Slither (Solidity), Spectral (OpenAPI), ShellCheck, MobSFScan (Mobile).
- **Scan Ingestion Methods:**
  - `POST /v1/sast/scan` (Passive mode, 60s timeout, multipart ZIP).
  - `POST /v1/sast/scan/active` (Active mode, 300s timeout, deep taint tracking).
  - `POST /v1/sast/scan/upload-url` + `POST /v1/sast/scan/direct`: Presigned cloud upload with SHA-256 content-addressable cache (<5ms instant response on cached hashes).
  - `POST /v1/sast/scan/repo`: Remote public or private repository scan.
- **Job Lifecycle & Telemetry:**
  - `GET /v1/jobs/{job_id}`: Status, normalized findings, deduplicated summary.
  - `GET /v1/jobs/{job_id}/stream`: Real-time SSE progress events (`tool_start`, `tool_complete`, `scan_complete`).
  - `GET /v1/jobs/{job_id}/export?format=sarif|json`: SARIF v2.1.0 compliant report.
  - `GET /v1/jobs/{job_id}/patch`: Unified `.patch` diff for automated remediation.

### 2.3 Codefy DAST Microservice (`https://dast-dutn.onrender.com`)
- **Authentication:** `Authorization: Bearer <jwt_access_token>` (same token as SAST).
- **Engine Fleet (30 Tools):**
  - **15 Passive Engines:** httpx, nmap, naabu, katana, dnsx, subzy, wafw00f, interactsh, subfinder, gau, sslyze, jsluice, graphql-cop, masscan, amass.
  - **15 Active Engines:** nuclei, dalfox, zap, ffuf, feroxbuster, corsy, crlfuzz, sstimap, sqlmap, nikto, arjun, kiterunner, jwt_tool, commix, access-control.
- **SSRF Zero-Trust Guardrail:**
  - `GET /v1/dast/validate-target?target_url=...`: Validates hostname, rejects 127.0.0.1, localhost, RFC-1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and AWS/GCP metadata endpoints (`169.254.169.254`).
- **Scan Submission:**
  - `POST /v1/dast/scan`: `{ target_url, mode: "passive"|"active", tools, crawl_depth, custom_headers, cookies, excluded_paths }`.
- **Job Lifecycle:**
  - `GET /v1/jobs/{job_id}`: Findings, target URL, duration, tool error diagnostics.
  - `GET /v1/jobs/{job_id}/stream`: SSE stream.
  - `GET /v1/jobs/{job_id}/export`: SARIF / JSON export.

---

## 3. Gap Analysis in Current Codefy Codebase

| Area | Current Codefy Implementation | Upgraded Target State |
|---|---|---|
| **Auth Base URL** | `DEFAULT_AI_GATEWAY_URL` in `hosted-client.ts` pointing to `https://i8791yv32r8c7t21387rcfvt8713cv.onrender.com` | `https://cmd-d-llm.vercel.app` as default auth & AI gateway |
| **Orchestrator URL** | `DEFAULT_ORCHESTRATOR_URL = "https://axiom-xjkc.onrender.com"` calling monolithic `/v1/targets` & `/v1/scans` | Dedicated SAST client (`https://sast-dutn.onrender.com`) and DAST client (`https://dast-dutn.onrender.com`) |
| **Desktop App CSP** | `connect-src` in `tauri.conf.json` restricts to `i8791y...` and `axiom-xjkc` | Allow `cmd-d-llm.vercel.app`, `sast-dutn.onrender.com`, `dast-dutn.onrender.com` |
| **Desktop Plugin Scope** | `capabilities/default.json` `http:default` allowlist only includes `axiom-xjkc` | Include `cmd-d-llm.vercel.app/*`, `sast-dutn.onrender.com/*`, `dast-dutn.onrender.com/*` |
| **Data Contracts** | `packages/types/src/orchestrator.ts` only knows legacy profiles (`sast-joern`, `sast-codeql`, `recon`, etc.) | Full contracts for 25 SAST tools, 30 DAST tools, SARIF export, and Git patch download |
| **Local Workspace Ingestion** | No ZIP builder in frontend / extension host | In-process Smart ZIP packaging honoring `.gitignore` & `.sastignore` for one-click SAST scan |
| **Finding Normalization** | Normalizes legacy Axiom response structures | Unified normalizer converting SAST/DAST findings to Codefy's AST `Finding` & GraphNode schema |

---

## 4. Detailed Implementation Plan

### Phase 1: Shared Data Contracts (`packages/types`)
1. **Extend `packages/types/src/orchestrator.ts`:**
   - Define `SastToolId` (25 tools) and `DastToolId` (30 tools).
   - Define `SastScanRequest`, `SastScanCreateResponse`, `SastScanDirectRequest`, `SastScanRepoRequest`.
   - Define `DastScanRequest`, `DastScanResponse`, `DastValidateTargetResponse`.
   - Define unified `SecurityJobDetail`, `JobSummary`, and `SecurityFinding` models.
2. **Update `BridgeMessage` Types (`packages/types/src/bridge.ts`):**
   - Add messages for:
     - `sast-scan-request` / `sast-scan-result`
     - `dast-scan-request` / `dast-scan-result`
     - `security-job-poll-request` / `security-job-poll-result`
     - `security-job-export-request` / `security-job-export-result`
     - `sast-autofix-patch-request` / `sast-autofix-patch-result`
     - `dast-validate-target-request` / `dast-validate-target-result`

### Phase 2: Client & Gateway Implementation (`packages/core`)
1. **Auth Service Update (`packages/core/src/auth/`):**
   - Update `DEFAULT_AUTH_SERVICE_URL = "https://cmd-d-llm.vercel.app"` in `constants.ts`.
   - Ensure `GatewayAuthClient` routes all `/developer/auth/*` calls to `https://cmd-d-llm.vercel.app`.
   - Cache JWT token in `AuthSession` and make it accessible to security clients.
2. **Dedicated SAST Client (`packages/core/src/sast/client.ts`):**
   - Expose `SastClient` with methods:
     - `getHealth()`
     - `getTools()`
     - `submitZipScan(zipBlob: Blob | Buffer, mode: "passive" | "active")`
     - `submitDirectScan(req: SastScanDirectRequest)`
     - `submitRepoScan(req: SastScanRepoRequest)`
     - `getJob(jobId: string)`
     - `pollJobUntilComplete(jobId: string, options)`
     - `streamJob(jobId: string, onEvent)`
     - `getAutofixPatch(jobId: string)`
     - `exportFindings(jobId: string, format: "sarif" | "json")`
3. **Dedicated DAST Client (`packages/core/src/dast/client.ts`):**
   - Expose `DastClient` with methods:
     - `getHealth()`
     - `getTools()`
     - `validateTarget(url: string)` (SSRF guardrail preflight)
     - `submitScan(req: DastScanRequest)`
     - `getJob(jobId: string)`
     - `pollJobUntilComplete(jobId: string, options)`
     - `streamJob(jobId: string, onEvent)`
     - `exportFindings(jobId: string, format: "sarif" | "json")`
4. **Unified In-Process Workspace ZIP Builder (`packages/core/src/sast/zip-builder.ts`):**
   - Pure TypeScript implementation of the `SmartZipBuilder` using `fflate`.
   - Prunes `node_modules`, `.git`, binary artifacts, and respects `.gitignore` / `.sastignore`.
   - Packages local workspace directly in Node.js (VS Code host) or Web Worker (Desktop app).
5. **Finding Normalizer (`packages/core/src/orchestrator/normalizer.ts`):**
   - Transform SAST findings into Codefy `Finding` records with `file_path`, `line_start`, `snippet`, CWE, and remediations.
   - Transform DAST findings into Codefy `Finding` records with `target_url`, parameter, CVSS, and evidence.

### Phase 3: Platform Bridge & Host Support
1. **Desktop App Configuration (`apps/desktop-app`):**
   - Update `src-tauri/tauri.conf.json`:
     - Add `https://cmd-d-llm.vercel.app`, `https://sast-dutn.onrender.com`, `https://dast-dutn.onrender.com` to `connect-src` (production and dev CSP).
   - Update `src-tauri/capabilities/default.json`:
     - Add `https://cmd-d-llm.vercel.app/*`, `https://sast-dutn.onrender.com/*`, `https://dast-dutn.onrender.com/*` to `http:default` allowlist.
   - Update `TauriBridgeClient.ts` to instantiate SAST and DAST clients using the shared token.
2. **VS Code Extension Host (`apps/vscode-extension`):**
   - Update `extensionBridge.ts` to route SAST and DAST requests.
   - Add user configuration settings in `package.json`:
     - `codefy.auth.url` (Default: `https://cmd-d-llm.vercel.app`)
     - `codefy.sast.url` (Default: `https://sast-dutn.onrender.com`)
     - `codefy.dast.url` (Default: `https://dast-dutn.onrender.com`)

### Phase 4: UI & Developer Experience (`packages/ui`)
1. **Unified Scan Header (`UnifiedScanHeader.tsx`):**
   - Upgrade mode selector:
     - **Local AST Scan:** In-process Tree-sitter & pattern matching.
     - **Cloud SAST Scan:** 25 tools, passive/active mode, workspace ZIP upload or GitHub repo.
     - **Target DAST Scan:** 30 tools, URL target input with instant SSRF status indicator.
2. **Finding Detail View:**
   - Display `detected_by` tool tags (e.g., Semgrep + Bandit corroboration).
   - Show "Apply Autofix Patch" button when a unified git diff is returned from `/v1/jobs/{id}/patch`.
   - Show DAST raw evidence & HTTP parameter details.
3. **Export & Report Actions:**
   - 1-click SARIF v2.1.0 download button for GitHub Security / DefectDojo integration.

---

## 5. Verification, Testing & Rollout Strategy

1. **Unit Testing:**
   - Unit tests for `SastClient` and `DastClient` mocking responses for upload, polling, streaming, and export.
   - Test for in-process `SmartZipBuilder` validating ignore patterns and archive integrity.
   - Normalizer test asserting SARIF/Finding fidelity.
2. **Live Integration Tests:**
   - E2E tests guarded by `RUN_LIVE_TESTS=1` against `https://cmd-d-llm.vercel.app`, `https://sast-dutn.onrender.com`, and `https://dast-dutn.onrender.com`.
3. **Release & Push:**
   - Commit all specification documents and implementation plans to `git`.
   - Push to `origin/main` on GitHub (`https://github.com/jayeshpandey01/codefy`).
