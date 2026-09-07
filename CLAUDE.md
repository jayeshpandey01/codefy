# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project: WhoAmI

**Purpose:** A real-time VS Code Extension and Desktop Application (Tauri) that identifies real bugs, security vulnerabilities, and data-flow propagation paths in source code with interactive finding cards, visual attack paths, and 1-click targeted local runtime verification.

**Core Operating Principles:**

1. **Precision & Trust Over Volume** — Optimize for developer trust and zero alert fatigue. Never generate unverified findings, arbitrary confidence scores, or noisy dashboards.
2. **Deterministic Taint + LLM Triage** — Static AST/pattern matching finds candidate Source ──▶ Sink paths; the LLM is used ONLY to evaluate intermediary sanitizers and generate unified git diff patches, never to hunt for bugs directly (see [`docs/DETECTION-ENGINE-SPEC.md`](docs/DETECTION-ENGINE-SPEC.md) §A.0 for why — narrow LLM questions measurably outperform open-ended ones). In Phase 1 this has two provider implementations (see below): an offline no-op default, and a real testing-phase implementation.
3. **No External Runtime Friction** — The VS Code extension and desktop app run natively in TypeScript/Node.js with in-process `web-tree-sitter` (WASM). No Python, pip, Docker, or external server/subprocess dependencies for core functionality — this ruled out shelling out to standalone binaries like TruffleHog (see ADRs).
4. **Contract-First Architecture** — `packages/types` is the single source of truth. All data contracts and `postMessage` bridge interfaces are strictly typed before writing UI or engine code.

---

## Phase 1 Scope: Deterministic Detection, Offline-Capable

Phase 1's detection and verification pipeline is deterministic by default — AST parsing, pattern rules, and local runtime probes — and can run fully offline. LLM triage is available but opt-in, not load-bearing: nothing in the deterministic pipeline depends on a model being reachable.

- **LLM triage is structured behind `ILlmTriageProvider`** (`packages/core/src/llm/provider.ts`), with two implementations:
  - `DeterministicOnlyProvider` (`packages/core/src/llm/deterministic-only.provider.ts`) — a no-op that always returns "unresolved." This is the default whenever no LLM is configured, and keeps the extension/desktop app fully functional offline with zero token cost.
  - `OpenRouterTriageProvider` (`packages/core/src/llm/openrouter.provider.ts`) — a real, working implementation for testing, calling OpenRouter's API. Activated only when `OPENROUTER_API_KEY` is set in the environment (plain env var for now — this is testing-phase wiring, not a production key-storage strategy; revisit before any real distribution).
  - Both implementations answer the exact same narrow question — classify one sanitizer on one candidate path, or generate one patch — never an open-ended "find bugs" prompt. See [`docs/DETECTION-ENGINE-SPEC.md`](docs/DETECTION-ENGINE-SPEC.md) §A.0 for the research behind why the interface stays this narrow.
  - If a sanitizer can't be classified deterministically and no LLM is configured, the path stays `needs-verification` — it never falls back to a guess.
- **Secret scanning is in-process, not TruffleHog.** TruffleHog is a Go binary with no Node/npm library, and its signature feature (live credential verification) makes outbound network calls — both violate the no-external-process constraint. Instead, `packages/core` implements its own lightweight regex + Shannon-entropy secret detector (same technique class TruffleHog/Gitleaks use for unverified detection), fully in-process. No live "is this credential still active" verification in Phase 1. See [`docs/DETECTION-ENGINE-SPEC.md`](docs/DETECTION-ENGINE-SPEC.md) §A.0 for the wider tool-landscape survey (Semgrep, CodeQL, Joern, Nuclei) and why none of them are bundled either.
- **Actual detection rule content** (sources/sinks/sanitizers per language, ast-grep rule YAML, the sanitizer-filter algorithm, PoC probe definitions) lives in [`docs/DETECTION-ENGINE-SPEC.md`](docs/DETECTION-ENGINE-SPEC.md), not in this file — this file stays architecture/process, the spec doc holds the concrete rule content that `packages/core` will be built against.

---

## Monorepo Structure (pnpm + Turborepo)

```text
whoami-monorepo/
├── .claude/
│   ├── skills/                 # Custom Claude Code skills for specialized tasks
│   │   ├── tree-sitter-parser/SKILL.md
│   │   ├── react-flow-visualizer/SKILL.md
│   │   ├── webview-bridge/SKILL.md
│   │   └── taint-engine/SKILL.md
│   └── settings.json
├── CLAUDE.md                   # This file
├── pnpm-workspace.yaml         # Monorepo root configuration
├── turbo.json                  # Turborepo build pipeline
├── tsconfig.base.json          # Base TypeScript config (shared by all packages)
├── packages/
│   ├── types/                  # Pure TS interfaces (Finding, GraphNode, TaintTrace, BridgeMessages)
│   │                           # No implementation, only type contracts
│   ├── core/                   # In-process analysis engine
│   │                           # - Taint flow analysis (web-tree-sitter AST parsing, tree-sitter-wasms grammars)
│   │                           # - Pattern matching (ast-grep — dual build: @ast-grep/napi for the
│   │                           #   extension host, @ast-grep/wasm for the Tauri webview; same TS source)
│   │                           # - In-process regex+entropy secret detector (no TruffleHog binary)
│   │                           # - ILlmTriageProvider interface; DeterministicOnlyProvider (offline
│   │                           #   default) + OpenRouterTriageProvider (testing) — see "Phase 1 Scope" above
│   │                           # - Fetch prober for local runtime verification
│   └── ui/                     # Shared React 19 SPA (Vite)
│                               # - Finding cards & management
│                               # - Data-flow visualization (@xyflow/react + elkjs)
│                               # - Styling (Tailwind CSS)
└── apps/
    ├── vscode-extension/       # VS Code Extension Host
    │                           # - Mounts packages/ui in a WebviewPanel
    │                           # - Runs packages/core (napi build) directly in the extension host (real Node.js)
    │                           # - Exposes VS Code-specific APIs (editor, workspace)
    └── desktop-app/            # Tauri v2 wrapper
                                # - Mounts packages/ui in the frontend webview
                                # - Runs packages/core (wasm build) in a Web Worker alongside packages/ui;
                                #   Tauri's Rust side is used only for fs/dialog access, not for the engine
```

**Key Principle:** Separation of concerns across boundaries:

- `packages/types`: Data contracts only
- `packages/core`: Pure analysis logic (no UI, no framework coupling)
- `packages/ui`: Reusable UI components & visualization (framework-agnostic container)
- `apps/*`: Platform-specific hosts (VS Code WebView, Tauri window)

---

## Build & Development Commands

### Setup

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (respects turbo.json pipeline)
pnpm dev                  # Start dev servers for all apps (watch mode)
```

### Development

```bash
# VS Code Extension
pnpm --filter @whoami/vscode-extension dev    # Run extension in dev mode
pnpm --filter @whoami/vscode-extension test   # Run extension tests

# Tauri Desktop App
pnpm --filter @whoami/desktop-app dev         # Run Tauri dev server
pnpm --filter @whoami/desktop-app build       # Build Tauri executable

# Shared UI (Storybook or dev server)
pnpm --filter @whoami/ui dev                  # Start UI dev server

# Core Engine
pnpm --filter @whoami/core test               # Run taint engine tests
pnpm --filter @whoami/core test -- --coverage # With coverage

# Types
pnpm --filter @whoami/types check             # TypeScript check only (no emit)
```

### Linting & Formatting

```bash
pnpm lint                 # Run ESLint across all packages
pnpm format               # Run Prettier
pnpm type-check           # Full TypeScript check (all packages)
```

### Testing

```bash
pnpm test                 # Run all tests
pnpm test -- --watch      # Watch mode
pnpm test -- --coverage   # Coverage report

# Single package
pnpm --filter @whoami/core test -- --watch
```

---

## Key Design Patterns & Constraints

### Type-First Development

- **Start in `packages/types`** — Define all data structures (Finding, TaintTrace, GraphNode, BridgeMessage) before implementation.
- **Single source of truth** — Never duplicate type definitions across packages. Import from `@whoami/types`.
- **Bridge interfaces** — All `postMessage` and IPC payloads must be fully typed and validated.

### Taint Flow Analysis (packages/core)

- **Entry point:** Source identifiers (user input, network, environment variables).
- **Propagation:** AST-based data-flow tracing via web-tree-sitter (grammars from `tree-sitter-wasms`).
- **Sink validation:** Match against known dangerous operations (SQL execution, OS command, XSS).
- **Sanitizer detection:** Deterministic pattern matching first — an intermediary function either matches a known-safe sanitizer pattern or it doesn't. Only genuinely ambiguous cases route through `ILlmTriageProvider`, which resolves via `DeterministicOnlyProvider` (offline default, always "unresolved") or `OpenRouterTriageProvider` (testing, opt-in) depending on what's configured.
- **Output:** Deterministic TaintTrace with complete Source ──▶ Sink path. No invented confidence scores — see [[taint-engine]] for the `confirmed | needs-verification | discarded` tri-state model.

### UI Architecture (packages/ui)

- **Framework:** React 19 (latest)
- **Graph visualization:** `@xyflow/react` for interactive data-flow diagrams.
- **Layout engine:** `elkjs` for hierarchical auto-layout of taint paths.
- **Styling:** Tailwind CSS (single design system for all platforms).
- **Component contract:** Props defined in `@whoami/types`; no platform-specific logic.

### Platform Hosts (apps/vscode-extension, apps/desktop-app)

- **VS Code Extension:** `packages/core` (napi build) runs directly in the extension host process — real Node.js, no Worker needed for the engine itself. `packages/ui` runs in a `WebviewPanel`; the two communicate over `vscode.postMessage`/`webview.postMessage`.
- **Tauri Desktop:** `packages/core` (wasm build) runs inside a Web Worker in the frontend, alongside `packages/ui` in the same webview. Tauri's Rust side is used _only_ for what the webview genuinely can't do itself — reading files off disk, via the `dialog`/`fs` plugins called from the main thread — never for running the analysis engine itself. The Worker never touches Tauri's IPC bridge directly.
- **Shared bridge:** Both platforms implement the same `BridgeMessage` protocol (defined in `@whoami/types`) via a common `BridgeClient` interface that `packages/ui` consumes — no host-specific branching inside `packages/ui` itself.

---

## Common Workflows

### Adding a New Finding Type

1. Define the type in `packages/types/src/findings.ts`.
2. Update `packages/core` detector to emit the new Finding variant.
3. Add corresponding UI card component in `packages/ui/src/components`.
4. Test the full pipeline: core → bridge → UI.

### Updating the Data-Flow Visualization

1. Review `packages/ui/src/visualization` (uses `@xyflow/react` + `elkjs`).
2. Modify graph layout or node rendering.
3. Ensure node/edge types match `@whoami/types` GraphNode interface.
4. Test in both VS Code Extension and Tauri Desktop dev servers.

### Adding a Sanitizer Pattern

1. Define the sanitizer signature in `packages/types/src/sanitizers.ts`.
2. Add the pattern to `packages/core/src/taint/sanitizers.ts`; wire the resolution logic through `packages/core/src/taint/sanitizer-filter.ts` (`resolveSanitizerStatus()` — see `docs/DETECTION-ENGINE-SPEC.md` §A.3 for the algorithm).
3. Don't call an LLM directly from this code — route ambiguous cases through `ILlmTriageProvider` instead (see `[[taint-engine]]`). Under the offline default (`DeterministicOnlyProvider`) an unresolved case leaves the path as `needs-verification` rather than guessing; it's only resolved further if `OpenRouterTriageProvider` is configured.
4. Add test case in `packages/core/src/__tests__/taint/sanitizer-filter.test.ts`.

### Testing a Single Vulnerability

1. Create a test file in `packages/core/src/__tests__/fixtures`.
2. Run: `pnpm --filter @whoami/core test -- --testNamePattern="your test name" --watch`
3. Iterate until taint engine produces correct TaintTrace.

---

## Architecture Decision Records

### Why Contract-First (packages/types)?

- Ensures UI, Core, and Hosts never drift out of sync.
- Enables parallel development: UI can mock types while Core is still being built.
- Makes bridge failures obvious at compile time, not runtime.

### Why No External Runtime?

- Keeping the analysis engine in-process (Node.js Worker or Tauri backend) eliminates latency and deployment friction.
- web-tree-sitter (WASM) runs natively without Python or Docker.
- ast-grep ships as a native addon (`@ast-grep/napi`, Node-API/N-API), not a WASM module by default — see the dual-build ADR below for how this actually gets bundled in each host.

### Why ast-grep Is Dual-Built (napi + wasm)

- `@ast-grep/napi` is a native Node.js addon — it runs fine in the VS Code extension host (which is Node.js) but cannot load inside a Tauri webview, which has no Node runtime.
- ast-grep also publishes `@ast-grep/wasm` (the same build used by its own browser playground), which does run in a webview.
- `packages/core` is built twice from the same TypeScript source: once targeting `@ast-grep/napi` for `apps/vscode-extension`, once targeting `@ast-grep/wasm` for `apps/desktop-app`. This was chosen over (a) shipping a Node.js sidecar binary inside the Tauri app, which adds an installer-size and process-management cost for no analysis benefit, and (b) dropping ast-grep entirely, which would lose its structural pattern matching for source/sink/sanitizer rules.
- Packaging note: `@ast-grep/napi`'s platform binaries ship as `optionalDependencies`; when bundling the VS Code extension with esbuild, native `.node` requires must be marked external, and `vsce package --target <platform>` should prune to the matching platform's optional dependency rather than shipping every OS's binary in one `.vsix`.

### Why In-Process Secret Detection, Not TruffleHog

- TruffleHog is a standalone Go binary with no Node/npm library — using it would mean bundling a ~20-50MB per-platform binary and shelling out via `child_process`, reintroducing exactly the external-process friction principle #3 rules out.
- Its flagship feature (live credential verification) works by calling third-party provider APIs over the network on an automatic scan — a materially different thing from an explicit, user-triggered LLM call (like `OpenRouterTriageProvider`) or the equally-opt-in PoC probes in `docs/DETECTION-ENGINE-SPEC.md` §A.4. Bundling the binary itself would still reintroduce the external-process problem regardless of the network question.
- Instead, `packages/core` implements its own regex + Shannon-entropy detector in-process — the same class of technique TruffleHog/Gitleaks use for unverified (non-network) detection. Live secret verification stays out of scope until an explicit future feature request, and even then should be user-triggered, never part of the automatic real-time scan.

### Why LLM Triage Has Two Providers, Not One

- `ILlmTriageProvider` is defined in `packages/core` so the taint engine never needs to change when the bound implementation changes — it only ever talks to the interface.
- `DeterministicOnlyProvider` stays the default whenever no LLM is configured: every classification it's asked for returns "not resolvable," pushing the path to `needs-verification` rather than fabricating a verdict. This keeps the extension/desktop app fully functional offline with zero token cost out of the box.
- `OpenRouterTriageProvider` was added as a real, working implementation for testing (opt-in via `OPENROUTER_API_KEY`), rather than leaving the interface unimplemented until some later phase — the user explicitly asked for a working provider to test against now, with the production key-storage/provider question revisited later.
- Both implementations are bound to the exact same narrow interface — one candidate path in, one classification or one patch out — never an open-ended chat call. See [`docs/DETECTION-ENGINE-SPEC.md`](docs/DETECTION-ENGINE-SPEC.md) §A.0 for the research (Purba et al. 2024) showing why that narrowness is what makes LLM triage reliable at all.

### Why Turborepo?

- Monorepo structure with isolated packages and apps.
- Incremental builds: only changed packages rebuild.
- Dependency graph and task orchestration (build → lint → test).

### Why React 19 + Vite (packages/ui)?

- Latest React APIs (Server Components potential, strict mode).
- Vite for instant HMR in dev, minimal bundle in prod.
- Single design system shared across VS Code WebView and Tauri window.

---

## Debugging Tips

### VS Code Extension

- Run `pnpm --filter @whoami/vscode-extension dev` — launches extension in debug mode.
- Check `Help > Toggle Developer Tools` in VS Code to view WebView console.
- Use `debugger;` statements and VS Code's debug console.

### Tauri Desktop App

- Dev server includes React DevTools and Tauri DevTools.
- Check `Tauri > Show DevTools` in the system tray.
- Logs from Tauri backend appear in the terminal.

### Core Engine (packages/core)

- Enable `DEBUG=whoami:*` for verbose taint tracing:
  ```bash
  DEBUG=whoami:* pnpm --filter @whoami/core test
  ```
- Tests with coverage:
  ```bash
  pnpm --filter @whoami/core test -- --coverage --watch
  ```

### Type Errors

- Always run `pnpm type-check` before committing.
- TypeScript errors in one package may affect others; check turbo.json build order.

---

## File Organization Guidelines

- **packages/types/src**: No logic, only interfaces and type utilities.
- **packages/core/src**: Pure functions, deterministic taint analysis, LLM client. No UI imports.
- **packages/ui/src**: React components, visualization, state management. No platform-specific code.
- **apps/\*/src**: Platform-specific logic only (VS Code API calls, Tauri commands).

---

## Skills

Specialized guidance lives in `.claude/skills/` — invoke these instead of re-deriving the patterns from scratch:

| Skill                   | Invoke when                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree-sitter-parser`    | Parsing source into ASTs in `packages/core` — loading WASM grammars, writing tree-sitter queries, adding a new source language                 |
| `taint-engine`          | Working on the deterministic source→sink detection pipeline — sources/sinks/sanitizers, path propagation, when (narrowly) to invoke LLM triage |
| `react-flow-visualizer` | Building the attack-path graph in `packages/ui` — `@xyflow/react` nodes/edges, `elkjs` layout                                                  |
| `webview-bridge`        | Wiring `postMessage`/Tauri communication between `packages/core` and `packages/ui` across the two host apps, or adding a `BridgeMessage` type  |

Each skill file cross-references the others where the pipelines meet (e.g. taint-engine emits what react-flow-visualizer renders, delivered via webview-bridge).

For actual detection-rule content (sources/sinks/sanitizers per language, ast-grep rule YAML, the sanitizer-filter algorithm, PoC probe definitions) see [`docs/DETECTION-ENGINE-SPEC.md`](docs/DETECTION-ENGINE-SPEC.md) — the `taint-engine` skill covers _how_ to work in the pipeline, that doc holds the concrete _what_.

For the natural-language chat panel feature (the Right Section in both app shells) — its Query AST, the deterministic intent grammar, and how a chat answer picks which of the 6 existing graph views to open — see [`docs/CHAT-QUERY-ENGINE-SPEC.md`](docs/CHAT-QUERY-ENGINE-SPEC.md). It also records exactly which parts of `chatbot_plan.md`'s broader vision (dependency/OSV intelligence, a GitHub Actions graph, PR diffing) are out of scope for this feature and why.

## Next Steps (Onboarding New Contributors)

1. Read this CLAUDE.md in full.
2. Run `pnpm install && pnpm build`.
3. Start with the relevant package (types → core → ui → apps).
4. Load the matching skill from the table above before implementing in that area.
