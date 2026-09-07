---
name: webview-bridge
description: Use when wiring communication between packages/core and packages/ui across the two host apps — the postMessage protocol in apps/vscode-extension, the Tauri command/event bridge in apps/desktop-app, or adding/changing a BridgeMessage type.
---

# Webview Bridge (apps/vscode-extension + apps/desktop-app)

Guidance for the boundary between the analysis engine (`packages/core`, runs host-side) and the UI (`packages/ui`, runs in a WebView/webview window). Both host apps must speak the **same** typed protocol so `packages/ui` never needs to know which host it's running in.

## The contract

- Every message crossing the bridge — either direction — is a `BridgeMessage` defined in `packages/types/src/bridge.ts`. No untyped `postMessage(arbitraryObject)` calls anywhere.
- `packages/ui` talks to a single abstraction (e.g. a `BridgeClient` interface: `send(msg)`, `on(type, handler)`), never to `vscode.postMessage` or Tauri's `invoke`/`listen` directly. The host app injects the concrete implementation.

## Two host implementations, one interface

|                                       | VS Code Extension                                  | Tauri Desktop                                |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| UI → Host                             | `vscode.postMessage(msg)` inside the webview       | `invoke('command_name', payload)`            |
| Host → UI                             | `webview.postMessage(msg)` from the extension host | `window.emit('event_name', payload)`         |
| Request/response                      | Manual correlation (requestId in payload)          | Tauri `invoke` is naturally request/response |
| Streaming (e.g. progressive findings) | Multiple `postMessage` calls                       | Multiple `emit` calls on the same event      |

Because VS Code's `postMessage` is fire-and-forget in both directions, **every** BridgeMessage that expects a reply carries a `requestId`, and the client-side abstraction correlates request/response by that id — this keeps the Tauri side (which gets request/response for free from `invoke`) implementable against the exact same `BridgeClient` interface without leaking the difference into `packages/ui`.

## Core rules

1. **Contract-first, always.** Add/change a `BridgeMessage` variant in `packages/types` before touching either host's implementation or the UI. If the type doesn't exist yet, nothing else should be written.
2. **Validate at the boundary, not deep in the UI.** Parse/narrow incoming messages right where they enter (`BridgeClient` implementation), so components downstream can trust the typed shape.
3. **No host-specific branching inside `packages/ui`.** If you find yourself writing `if (isVsCode) ... else ...` inside a UI component, the abstraction has leaked — fix the `BridgeClient` implementation instead.
4. **Large payloads (full TaintTrace graphs) should be sent whole, not paginated ad hoc.** Chunking/streaming is only worth the complexity for progressive scan results (findings arriving as analysis completes), not for a single trace's node list.

## Where this lives

- `packages/types/src/bridge.ts` — `BridgeMessage` union type, request/response pairs.
- `packages/ui/src/bridge/` — `BridgeClient` interface + a mock/test implementation.
- `apps/vscode-extension/src/bridge/` — concrete `postMessage`-based implementation, extension-host side.
- `apps/desktop-app/src-tauri/` + `apps/desktop-app/src/bridge/` — Tauri commands/events + the frontend-side implementation.

## Adding a new message type

1. Add the variant to the `BridgeMessage` union in `packages/types`.
2. Implement the handler on the host side that originates or receives it (extension host and/or Tauri command).
3. Implement the corresponding case in both `BridgeClient` implementations (VS Code + Tauri) — a message type unimplemented on one host is a bug, not a TODO.
4. Consume it in `packages/ui` via the shared `BridgeClient` interface only.

## Related

- [[taint-engine]] — the Finding/TaintTrace payloads that travel over this bridge.
- [[react-flow-visualizer]] — the UI-side consumer of trace data delivered via the bridge, and originator of node-click events sent back over it.
