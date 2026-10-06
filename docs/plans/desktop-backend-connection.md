# Desktop-to-Axiom Connection: Implementation Record

**Status:** implemented · **Scope:** desktop, VS Code extension, shared UI/core, Axiom API, and website account gateway.

The proposal below is retained as historical context and is superseded by this implementation:

- Desktop and VS Code use the fixed `DEFAULT_ORCHESTRATOR_URL` and the signed-in user's OIDC bearer session. They no longer read operator/admin keys or custom orchestrator URLs from settings, extension configuration, or workspace `.env` files.
- Axiom validates the bearer token's signature, issuer, audience, subject, and configured role. OIDC `sub` owns each operator-created target; target, scan, result, and dashboard reads are scoped to that subject. Other operator APIs are denied by default until explicitly tenant-scoped. Admin principals retain platform-wide access.
- Creating a target requires both an authorization reference and explicit user attestation. The consent must be repeated when the target/workspace changes.
- Historical targets with no `owner_subject` remain admin-only. Existing ownership must be backfilled from a verified mapping; it is never inferred from `owner_reference`.
- The website account BFF now accepts an operation allowlist and user bearer token over HTTPS; its former browser-shipped AES/HMAC shared keys were removed. Axiom upstream access is fixed by server-side configuration, not by client URLs.
- Production Axiom must stay in `AUTH_MODE=oidc`. Development API-key mode remains only for local tests/controller operations and must never be used to configure the distributed apps.

## Historical Proposal (Superseded)

The desktop app is already half-connected. Sign-in and chat work because they call the AI gateway straight from the webview. Cloud SAST/DAST scans don't work, and simply lifting the block won't fix them: the orchestrator server refuses requests from any browser origin, the Tauri webview included. On top of that, neither app has a working, user-editable backend URL setting.

---

## 1. Findings

### 1.1 How each app talks to the backend

**VS Code:** the webview never calls the network itself. It sends typed `BridgeMessage`s to the extension host. The host runs real Node.js, builds `ScanOrchestratorClient` and `GatewayAuthClient` from `@whoami/core/node`, and posts results back (`apps/vscode-extension/src/bridge/extensionBridge.ts`). It handles about 45 request types.

**Desktop:** `apps/desktop-app/src/bridge/TauriBridgeClient.ts` handles 10. Everything else falls into a `default:` branch that returns "not available in the desktop app".

| Feature | VS Code | Desktop today |
|---|---|---|
| Auth (sign-in, register, API keys) | through the bridge | ✅ works: `App.tsx` calls `GatewayAuthClient` directly (the gateway returns `Access-Control-Allow-Origin: *`) |
| Chat | – | ✅ direct (`HostedLlmClient`) |
| Orchestrator: targets, SAST/DAST submit/poll/cancel/retry, audit events, stats (20 types) | through the bridge | ❌ rejected. **This is the gap.** |
| Saving history and settings | bridge to `globalState` and `~/.codefy` | ✅ its own IndexedDB, no bridge needed |
| Apply fix / run PoC | through the bridge | answers "not available" |

### 1.2 The orchestrator blocks browser calls (CORS)

CORS preflight requests to `https://axiom-xjkc.onrender.com/api/v1/targets` from `tauri://localhost`, `http://localhost:1420` and a `vscode-webview://` origin all returned **HTTP 400 with no `Access-Control-Allow-Origin` header**, so the webview engine blocks every call. The orchestrator host is already in the CSP `connect-src`, but that doesn't help. VS Code avoids the problem only because its calls run in Node, where CORS doesn't apply.

### 1.3 Core bugs that break a webview client

- `packages/core/src/orchestrator/client.ts` stores `fetch` without binding it. In a webview that throws "Illegal invocation", the same bug `GatewayAuthClient` already fixed with `fetch.bind(globalThis)`.
- `packages/core/src/orchestrator/hmac.ts` returns an **empty signature** when Node's `crypto` isn't available, instead of throwing. Only `claimControllerJob` and `getControllerJobStatus` use it, and the UI calls neither, but it fails silently.
- `ScanOrchestratorClient` isn't exported from `@whoami/core/query`, which is the bundle the desktop main thread imports.

### 1.4 Poll timeouts are shorter than a scan

A scan poll can run for up to 40 minutes (`DEFAULT_POLL_MAX_WAIT_MS`). The desktop `bridge.request` gives up after 30 seconds and VS Code's after 120 seconds. Both cut long scans off; VS Code's bug just shows up later.

### 1.5 Backend URLs are hard-coded, unused, or frozen

There are **two** backend URLs:

| Backend | Default | Used for |
|---|---|---|
| Central Auth & AI Gateway | `https://cmd-d-llm.vercel.app` (`packages/core/src/orchestrator/constants.ts`) | sign-in, JWT auth, API keys, AI chat |
| SAST Microservice | `https://sast-dutn.onrender.com` (`packages/core/src/orchestrator/constants.ts`) | source-code scans, 25 SAST tools |
| DAST Microservice | `https://dast-dutn.onrender.com` (`packages/core/src/orchestrator/constants.ts`) | dynamic scans, SSRF guardrails |

**How each app picks the URL today:**

- **VS Code, orchestrator:** checks, in order, the `whoami.orchestrator.url` setting, the `ORCHESTRATOR_URL` environment variable, a `.env` file, then the default. A running panel re-reads it when a `.env` file or that setting changes. It works.
- **Desktop, orchestrator:** nothing reads a URL, because scans are blocked and the client is never built. `UserSettings.orchestratorUrl` exists (`packages/types/src/persistence.ts`), but the Settings modal **has no input field** for it and no code in either app reads it. The field is dead in both apps.
- **Desktop, AI gateway** (`App.tsx`): uses `VITE_AI_API_URL`, then `VITE_AXIOM_API_URL`, then the default.
  - `VITE_*` values are **fixed when the app is built**. Users can't change them after installing, and the desktop app has no runtime `.env` loading like VS Code's.
  - `VITE_AXIOM_API_URL` is the orchestrator's name, but it's used as a fallback for the **gateway**. If someone sets it to the Axiom URL, sign-in and chat get sent to the wrong server.

**Problems:**

1. **The same URL is typed out in 8 places:** core `constants.ts`, both apps' `db/preferencesRepo.ts`, `packages/ui/.../SettingsHistoryModal.tsx`, the VS Code `package.json` setting default, both CSPs in `tauri.conf.json`, and `.env.example`. If the backend moves, one of them will be missed.
2. **Saved settings freeze the default URL.** `saveSettings()` writes the whole merged settings object, including the default `orchestratorUrl`, to IndexedDB. From then on, the saved value wins over the code default, so every existing install keeps calling the old URL after the backend moves.
3. **The Tauri allowlist is fixed at build time.** The `tauri-plugin-http` scope and the CSP are compiled into the app, and Settings can't widen them while it runs. A URL that isn't on the list fails with a scope error; blocked CSP requests show up as generic network errors.
4. **API keys follow the URL.** If users can enter any orchestrator URL, their operator/admin keys get sent to whatever host they typed.

### 1.6 VS Code behavior that must not be copied

- `handleRunPoc` hard-codes `const verified = true` and returns canned "[PoC Verified] … confirmed exploitable" text without running any probe. That breaks CLAUDE.md's rule against unverified findings.
- The `remote-` branch of `handleApplyFix` writes a hard-coded `middleware.ts` into whatever workspace is open.

Both should be fixed in VS Code, not added to desktop (tracked separately in §5).

---

## 2. Decision: route orchestrator calls through Rust with `tauri-plugin-http`

With the official HTTP plugin, requests go out from Rust, so CORS doesn't apply, and its `fetch` has the same shape as the browser's. It is passed as `fetchFn` to the existing `ScanOrchestratorClient`, and none of the client code changes. This fits CLAUDE.md's rule that Tauri's Rust side is used "only for what the webview genuinely can't do itself": cross-origin calls to a server without CORS support are exactly that. The capability file can restrict it to known hosts.

**Alternative considered:** change the orchestrator server to allow `tauri://localhost` (macOS/Linux) and `http://tauri.localhost` (Windows). That's less client work, but it only helps if we control that server, and scans break whenever the app is pointed at a server that doesn't allow those origins.

---

## 3. Implementation plan

### Phase 1: transport (Rust and capabilities)

1. `pnpm tauri add http`. This adds `tauri-plugin-http` to `Cargo.toml`, `@tauri-apps/plugin-http` to `package.json` and `.plugin(tauri_plugin_http::init())` in `src-tauri/src/lib.rs`.
2. In `src-tauri/capabilities/default.json`, add `http:default` scoped to the backend allowlist from Phase 5, step 12.
3. Update the "offline, read-only, no http" wording in the capability description, `lib.rs`, `Cargo.toml`, `TauriBridgeClient.ts` comments and CLAUDE.md's Tauri section.

### Phase 2: core fixes (`packages/core`)

4. Bind the default fetch in `ScanOrchestratorClient`: `fetch.bind(globalThis)`.
5. Make HMAC signing throw a clear error when Node's `crypto` is missing, instead of returning `""`. It could be ported to WebCrypto later if a webview ever needs controller endpoints.
6. Export `ScanOrchestratorClient` and `toStructuredError` from the `query` entry, and rebuild `dist-query`.

### Phase 3: one shared message router

7. Move the 20 orchestrator `case`s out of `extensionBridge.ts` into a new `packages/core/src/orchestrator/bridge-router.ts`, as `handleOrchestratorMessage(client, message, post): Promise<boolean>`. Include the `poll-remote-scans-progress` streaming and the `toStructuredError` error shape.
8. Make VS Code's `extensionBridge.ts` call it. Behavior stays the same and there's about 250 fewer lines to maintain twice.

### Phase 4: desktop wiring

9. In `TauriBridgeClient`, build the client with the URL from Phase 5, step 11, the keys from `getSettings()` (`operatorApiKey`, `adminApiKey`), and `fetchFn` set to the plugin's `fetch`. Rebuild it when settings are saved.
10. Call `handleOrchestratorMessage` before the `default:` branch, and keep that branch only for genuinely unsupported requests.

### Phase 5: backend URL configuration

11. **Resolution order** (one helper in `packages/core`, used by both apps where applicable):
    - **Orchestrator (desktop):** Settings `orchestratorUrl` if the user set one, then a build-time `VITE_ORCHESTRATOR_URL`, then `DEFAULT_ORCHESTRATOR_URL`. This mirrors VS Code's order, with Settings in place of `.env`.
    - **Gateway (desktop):** `VITE_AI_API_URL`, then `DEFAULT_AI_GATEWAY_URL`. Drop the `VITE_AXIOM_API_URL` fallback.
12. **One allowlist, used in both configs:** the production Axiom URL, plus `http://localhost:*` and `http://127.0.0.1:*` for local backend development, in both the plugin-http scope and the Settings validation. Require `https` except on localhost. Anything outside the list gets a clear message in Settings instead of failing at scan time, and keys are never sent to an unlisted host.
13. **One definition of each default:** both apps' `preferencesRepo.ts` and `SettingsHistoryModal.tsx` import `DEFAULT_ORCHESTRATOR_URL` instead of repeating the string. The VS Code `package.json` default and `.env.example` stay as literals but get a comment pointing at `constants.ts`.
14. **Fix the frozen default:** save `orchestratorUrl` only when the user actually changed it. Treat an empty value as "use the default", and on load clear any saved value that equals a known old default, so existing installs follow the code default again.
15. **Add the missing Settings input** (`packages/ui`) for the orchestrator URL, with a "Test connection" button. Render's free tier takes 30–50 seconds to wake up, so show that the server may be waking up rather than reporting a failure.
16. **CSP cleanup:** once orchestrator calls go through plugin-http, remove the orchestrator host from `connect-src` in `tauri.conf.json`. Keep the gateway host there, since auth and chat still call it straight from the webview. If `VITE_AI_API_URL` is set to a different host at build time, the CSP must be updated to match.

### Phase 6: timeouts

17. Give poll requests in `App.tsx` an explicit timeout above `DEFAULT_POLL_MAX_WAIT_MS`, or better, make polling a streaming message like `scan-workspace`. Apply the same fix in VS Code.

### Phase 7: security and scope decisions

18. **Keys:** operator/admin keys currently sit unencrypted in IndexedDB, similar to VS Code's `settings.json`. That's acceptable for the testing phase per CLAUDE.md, but move them to the OS keychain (e.g. the Stronghold plugin) before distribution. Also reconsider sending the **admin** key from a desktop client at all; only `getStats` needs it.
19. Leave auth calling the gateway directly (CORS is fine there). Leave persistence on IndexedDB.
20. Keep apply-fix and run-PoC answering "unavailable" in desktop.

### Phase 8: tests

21. Unit-test the router with a mock `fetchFn`: each message type, error mapping and progress streaming.
22. Unit-test URL resolution: precedence order, allowlist accept/reject, `https` enforcement, and the migration that clears a saved stale default.
23. Add `TauriBridgeClient` tests with a mocked `@tauri-apps/plugin-http`.
24. Manual test: rebuild Tauri, save an operator key in Settings, register a target, then run one SAST and one DAST profile end to end. Confirm that a clean scan shows zero findings, not a made-up one. Then enter a URL outside the allowlist and confirm Settings rejects it.

**Minimum to get desktop scans working:** Phases 1, 2 and 4, plus step 11 (orchestrator resolution). Phase 3 keeps the two apps in sync afterwards; the rest of Phase 5 makes the URL safe and editable.

---

## 4. Open decisions

- **Custom orchestrator URLs:** fixed allowlist (recommended) or any `https://*` host? This sets the plugin-http scope width in step 2 and the validation in step 12.
- **Local backend development:** does anyone run the orchestrator locally, or does everyone use the Render deployment? Decides whether `localhost` entries ship in release builds or only in dev builds.
- **Server-side CORS:** if we control the orchestrator, allowing Tauri origins there is still worth doing, but this plan doesn't depend on it.

## 5. Related follow-ups (separate work)

- VS Code `handleRunPoc`: remove the hard-coded `verified = true` and canned output.
- VS Code `handleApplyFix` `remote-` branch: stop writing a hard-coded `middleware.ts`.
- Desktop scans drop `SecretFinding` results because no `BridgeMessage` carries them yet (`TauriBridgeClient.handleScanWorkspace`).
- `walkDir` in `workspaceFs.ts` hides filesystem permission errors behind "contains no scannable files". It should report the first error when zero files are collected.
