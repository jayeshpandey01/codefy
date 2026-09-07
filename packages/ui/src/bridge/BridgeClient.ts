import type { BridgeMessage, BridgeMessageType } from "@whoami/types";

export type BridgeMessageOfType<T extends BridgeMessageType> = Extract<
  BridgeMessage,
  { type: T }
>;

/**
 * The one abstraction packages/ui talks to. Never `vscode.postMessage` or
 * Tauri's `invoke`/`listen` directly -- the host app (VS Code extension or
 * Tauri desktop) injects a concrete implementation via BridgeProvider. See
 * the webview-bridge skill.
 */
export interface BridgeClient {
  /** Fire-and-forget send, either direction. */
  send(message: BridgeMessage): void;

  /** Subscribe to messages of a given type; returns an unsubscribe function. */
  on<T extends BridgeMessageType>(
    type: T,
    handler: (message: BridgeMessageOfType<T>) => void,
  ): () => void;

  /**
   * Send a message and resolve with the correlated reply (matched by
   * `requestId`). Both VS Code's fire-and-forget postMessage and Tauri's
   * naturally request/response `invoke` implement against this same shape --
   * see the webview-bridge skill's request/response row.
   */
  request<TReq extends BridgeMessage, TRes extends BridgeMessage>(
    message: TReq,
    timeoutMs?: number,
  ): Promise<TRes>;
}
