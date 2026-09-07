import type { BridgeMessage, BridgeMessageType } from "@whoami/types";
import type { BridgeClient, BridgeMessageOfType } from "@whoami/ui";

type Handler = (message: BridgeMessage) => void;
type VsCodeApi = ReturnType<typeof acquireVsCodeApi>;

let requestCounter = 0;

/**
 * WEBVIEW side implementation of packages/ui's BridgeClient interface (see
 * packages/ui/src/bridge/BridgeClient.ts and the webview-bridge skill).
 * Uses acquireVsCodeApi().postMessage() to send and
 * window.addEventListener('message', ...) to receive -- VS Code's
 * postMessage is fire-and-forget in both directions, so request() correlates
 * replies by `requestId`, mirroring
 * packages/ui/src/bridge/MockBridgeClient.ts's own request() implementation.
 */
export class VsCodeBridgeClient implements BridgeClient {
  private readonly vscode: VsCodeApi;
  private readonly handlers = new Map<BridgeMessageType, Set<Handler>>();
  private readonly anyHandlers = new Set<Handler>();
  private readonly defaultTimeoutMs: number;

  constructor(
    vscodeApi: VsCodeApi = acquireVsCodeApi(),
    defaultTimeoutMs = 120_000,
  ) {
    this.vscode = vscodeApi;
    this.defaultTimeoutMs = defaultTimeoutMs;
    window.addEventListener("message", (event: MessageEvent<BridgeMessage>) => {
      this.dispatch(event.data);
    });
  }

  send(message: BridgeMessage): void {
    this.vscode.postMessage(message);
  }

  on<T extends BridgeMessageType>(
    type: T,
    handler: (message: BridgeMessageOfType<T>) => void,
  ): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    set.add(handler as Handler);
    this.handlers.set(type, set);
    return () => {
      set.delete(handler as Handler);
    };
  }

  async request<TReq extends BridgeMessage, TRes extends BridgeMessage>(
    message: TReq,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<TRes> {
    requestCounter += 1;
    const requestId = message.requestId ?? `webview-req-${requestCounter}`;
    const outgoing = { ...message, requestId } as TReq;

    return new Promise<TRes>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.anyHandlers.delete(handler);
      };

      const handler: Handler = (incoming) => {
        if (incoming.requestId !== requestId) return;
        cleanup();
        if (incoming.type === "error") {
          reject(new Error(incoming.message));
        } else {
          resolve(incoming as TRes);
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `BridgeClient request timed out after ${timeoutMs}ms: ${message.type}`,
          ),
        );
      }, timeoutMs);

      this.anyHandlers.add(handler);
      this.send(outgoing);
    });
  }

  private dispatch(message: BridgeMessage): void {
    const set = this.handlers.get(message.type);
    if (set) {
      for (const handler of [...set]) handler(message);
    }
    for (const handler of [...this.anyHandlers]) handler(message);
  }
}
