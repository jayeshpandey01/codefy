# Local Persistence ("DB like VS Code") — Research & Implementation Plan

**Scope of this doc:** local, on-disk persistence of session data (recent workspaces, scan history, chat history, preferences) across both app shells. This supersedes only the DB half of the plan drafted at `/Users/jayesh/.gemini/antigravity/brain/b9810e82-3ced-4a2e-b3e8-f7d18d23c121/implementation_plan.md` — that file also covers an animated splash screen, which is a separate, unrelated feature not requested in this pass and not touched here.

That draft is a reasonable starting point but gets two things wrong that matter for actually building this: it treats the feature as desktop-only (the VS Code extension needs nothing built for this — see §1), and its schema, despite citing VS Code as inspiration, isn't actually how VS Code's own storage works (see §2). Both are corrected below before proposing anything.

---

## 1. Ground truth — what exists today, in both apps

| | `apps/desktop-app` | `apps/vscode-extension` |
|---|---|---|
| Persists anything today? | Yes, one string: `localStorage.getItem/setItem("whoami:last_folder")` — 4 call sites in `App.tsx` (lines 137, 246, 267, 673) | **No.** Zero usage of `context.globalState`, `context.workspaceState`, or `context.globalStorageUri` anywhere in `apps/vscode-extension/src` (verified by grep — no matches) |
| Has a real "local database" available for free? | No — needs one built | **Yes.** VS Code's `ExtensionContext` (already passed into `activate()`) gives every extension `globalState: Memento` and `workspaceState: Memento` for free — a JSON-serializable key-value store VS Code itself persists to `state.vscdb` (see §2). No SQLite, no new Rust dependency, nothing to build except calling an API that's already there. |
| Current Tauri capabilities | `apps/desktop-app/src-tauri/capabilities/default.json` — description reads literally **"offline, read-only: no shell/http, no fs write."** Permissions granted: `core:default`, `core:window:default`, `dialog:default`, `fs:default`, `fs:allow-read-text-file`, `fs:allow-read-dir`, `fs:allow-exists`. No write permission of any kind exists today. | n/a — VS Code extensions run in Node.js with no comparable sandbox; `globalState`/`workspaceState` need no capability grant. |
| Rust dependencies | `Cargo.toml`: `tauri` + `tauri-plugin-dialog` only. No `tauri-plugin-sql`, no `tauri-plugin-fs`. | n/a |

**Correction to the original draft's framing:** "implement DB like VS Code" for the **VS Code extension** doesn't mean building a database — it means using the database VS Code already ships (§2). Work is only required for the **desktop app**, which has no such built-in. The two platforms need parity in *behavior* (same recent-workspaces list, same scan/chat history), not identical *implementation* — this mirrors how `BridgeClient`/`BridgeMessage` already let both shells implement one contract differently (`VsCodeBridgeClient` vs. `TauriBridgeClient`), which is the pattern §4 reuses here.

---

## 2. Corrected research: how VS Code actually stores this

The original draft's VS Code section is broadly right about *where* (`state.vscdb`, `globalStorage/`, `workspaceStorage/`) but wrong about *shape*. VS Code's `state.vscdb` is **not** a relational schema with foreign keys between entities — it is a SQLite file used purely as a fast, crash-safe file format for a **flat key-value store**:

```sql
CREATE TABLE ItemTable (
  key TEXT UNIQUE ON CONFLICT REPLACE,
  value BLOB
);
```

That's the entire schema. Every extension's `globalState`/`workspaceState`, and most of VS Code's own UI state, is one row each: a string key, a JSON-serialized blob value. There's no `scan_sessions` table with a `workspace_id` foreign key — an extension that wants "sessions for this workspace" serializes an array/object under one key (e.g. `"myext.scanSessions"`) and deserializes the whole thing on read. VS Code chose SQLite over flat JSON files specifically for write durability and to avoid partial-write corruption on crash — not for relational querying.

This matters because the original draft's 6-table relational schema (`workspaces`, `scan_sessions`, `findings`, `chat_turns`, `preferences`, `collections` + a join table) is a reasonable *general* app-database design, but it is not "like VS Code" — it's closer to a conventional backend schema. §5 below proposes a hybrid that's honest about which parts should be VS-Code-style flat KV and which parts genuinely earn a real table.

---

## 3. The real decision this feature forces: read-only → stateful

`tauri-plugin-sql`'s permissions (`sql:default`, `sql:allow-execute`, `sql:allow-load`, `sql:allow-select`, `sql:allow-close`) are their own independent namespace — confirmed against Tauri's plugin docs — and are **not** gated by the `fs:*` permissions this app currently restricts. So technically, adding SQLite persistence does not require granting `fs:allow-write-*` or loosening the fs plugin at all.

But that misses the point of `capabilities/default.json`'s own description. "Offline, read-only" isn't there because SQLite happened to be blocked by `fs:*` — it's a stated design intent for what kind of app this is (see also this session's earlier finding that the same file blocks Hackerbot's network calls for the same reason). Adding a local database is a genuine change to that intent: this app would go from "reads your code, tells you about it, forgets everything on exit" to "remembers things about you across sessions, and writes them to disk without being told each time." That's a reasonable, common thing for a desktop app to do — but it's a product decision, not just a permissions checkbox, and §7 asks about it explicitly rather than assuming it.

---

## 4. Proposed architecture — one contract, two backends

Mirrors the existing `BridgeClient` pattern instead of inventing a new one:

```text
packages/types/src/persistence.ts   (NEW — contract-first, per CLAUDE.md)
  WorkspaceEntry, ScanSessionEntry, FindingEntry, ChatTurnEntry, PreferenceEntry

packages/ui  — NO changes for this feature. Persistence is host-side state
  the app shell (App.tsx / main.tsx) reads into React state and passes down
  as props, exactly like findings/workspaceGraph already are. packages/ui
  stays framework-agnostic and gets no new platform-specific code.

apps/desktop-app/src/db/          (NEW)
  client.ts         -- wraps @tauri-apps/plugin-sql, runs migrations
  workspaceRepo.ts, scanRepo.ts, chatRepo.ts, preferencesRepo.ts

apps/vscode-extension/src/persistence/   (NEW)
  memento-store.ts  -- wraps context.globalState / context.workspaceState,
                       implementing the SAME repo function signatures as
                       apps/desktop-app/src/db/*Repo.ts (same shape, no
                       shared runtime code -- Memento's API is synchronous
                       get/update, SQL's is async, so a literal shared
                       implementation isn't worth forcing)
```

Both `*Repo` modules expose the same function signatures (`upsertWorkspace`, `getRecentWorkspaces`, `createScanSession`, `saveFindings`, `saveChatTurn`, `getChatHistory`, `getPreference`/`setPreference`) so `App.tsx` and `main.tsx` — which are already near-duplicates of each other, per this session's earlier findings — can call identical code paths, each backed by whatever storage fits its host.

---

## 5. Schema — hybrid, not a wholesale relational copy

**Flat KV (genuinely "like VS Code"):** preferences, last-opened-folder, and the recent-workspaces list. These are small, read-mostly, and never queried by anything other than "give me the whole thing" — exactly VS Code's `ItemTable` use case.

```sql
CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,      -- JSON
  updated_at INTEGER NOT NULL
);
-- keys used: "recent_workspaces" (JSON array, capped at 10, most-recent-first),
-- "last_folder", "pref.<name>" per preference
```

**Real tables (earn their complexity):** scan sessions and findings. Unlike VS Code's extension state, this data can genuinely be large (hundreds of findings per scan, many scans over time) and the app already wants to query it by shape (severity, workspace, session) — e.g. a future "show me how findings trended over the last 10 scans of this workspace" is a real `WHERE`/`GROUP BY`, not a "deserialize everything and filter in JS" operation. This is the one place deviating from VS Code's pure-KV model is the right call, not just convenient:

```sql
CREATE TABLE scan_sessions (
  id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  mode TEXT NOT NULL,             -- 'local-offline' | 'cloud-sast' | 'target-dast'
  findings_count INTEGER DEFAULT 0
);

CREATE TABLE findings (
  id TEXT PRIMARY KEY,            -- Finding.id, unchanged
  session_id TEXT NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_json TEXT NOT NULL          -- full Finding object, exactly as-is --
);                                -- never reconstruct a Finding from
                                  -- separate columns; the object is the
                                  -- source of truth, columns are just
                                  -- indexes for filtering
CREATE INDEX idx_findings_session ON findings(session_id);
CREATE INDEX idx_findings_severity ON findings(severity);
```

**Chat history:** one `kv_store` row per workspace (`"chat.<workspace_id>"`), holding the last N turns as a JSON array — not a `chat_turns` table with a foreign key per message. There's no query need here ("get all turns for this workspace, in order" is the only access pattern, same as VS Code's own approach to per-extension state), so a table + FK would be relational ceremony with no payoff. §7 asks what N should be.

**Dropped from the original draft:** the `collections`/`collection_items` tables — no "user-curated finding collections" feature exists anywhere in this codebase today (not in `packages/types`, not in either app shell), so persisting for a feature that doesn't exist yet is speculative. Add it if/when that feature is actually built, per CLAUDE.md's "don't design for hypothetical future requirements."

---

## 6. Implementation phases

**Phase 0 — Decide §7's open questions.** Everything below assumes answers to those.

**Phase 1 — Types.** `packages/types/src/persistence.ts`: the entry shapes above. Export from `packages/types/src/index.ts`.

**Phase 2 — Desktop backend.**
- `Cargo.toml`: add `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`.
- `capabilities/default.json`: add `"sql:default"`, `"sql:allow-execute"` — update the file's own description string too, since "no fs write" stays true but "read-only" no longer describes the whole app once this lands.
- `src-tauri/src/lib.rs`: register `tauri_plugin_sql::Builder::default().build()`.
- `tauri.conf.json`: add the `plugins.sql.preload` migration config.
- `apps/desktop-app/src/db/*`: migrations + repo functions per §4/§5.
- Migrate the 4 existing `localStorage` call sites in `App.tsx` to `preferencesRepo` — one store, not two.

**Phase 3 — VS Code extension backend.** `apps/vscode-extension/src/persistence/memento-store.ts`, same function signatures, backed by `context.globalState` (cross-workspace: recent workspaces, preferences) and `context.workspaceState` (per-workspace: that workspace's scan/chat history). No new permission, no new dependency — `ExtensionContext` is already threaded through `extensionBridge.ts`.

**Phase 4 — Wire into both app shells.** `App.tsx`/`main.tsx`: on workspace open → `upsertWorkspace`; on scan complete → `createScanSession` + `saveFindings`; on chat turn → `saveChatTurn`; on mount → `getRecentWorkspaces` to populate a "Recent" list (only if §7.Q4 says build one now).

**Phase 5 — Tests.** Repo-level unit tests per backend (mock `@tauri-apps/plugin-sql`'s `Database.load`, and a real `Memento` stub for the extension side) — mirrors this repo's existing pattern of testing `packages/core/src/orchestrator/client.test.ts` against a mocked `fetch`.

---

## 7. Open decisions — yours to make

1. **The read-only → stateful shift (§3).** Comfortable with the desktop app writing a persistent local database, and updating `capabilities/default.json`'s description to reflect that it's no longer purely read-only?
2. **Chat history retention.** How many turns per workspace — last 50? Unbounded (until the user clears it, like the existing "Clear Chat History" button in `ChatPanel.tsx` already allows in-memory)?
3. **Does the VS Code extension need a "Recent Workspaces" UI at all?** VS Code itself already has its own native "Recent" list (File → Open Recent) — building a second, WhoAmI-specific one inside the extension's own UI may be redundant there, even though it's genuinely useful for the standalone desktop app (which has no OS-level "recent projects" list of its own).
4. **Scope for this pass.** Build all of §4/§5 (workspaces + scans + findings + chat + preferences), or start narrower (e.g. just preferences + recent workspaces first, since that's the smallest slice that actually replaces the current raw `localStorage` calls) and add scan/chat persistence in a follow-up?
