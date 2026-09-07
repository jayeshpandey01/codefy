import type { BridgeMessage, BridgeMessageType } from "@whoami/types";
import type { BridgeClient, BridgeMessageOfType } from "./BridgeClient.js";

type Handler = (message: BridgeMessage) => void;

export interface MockBridgeClientOptions {
  /** Default timeout for request(), in ms. Defaults to 5000. */
  readonly timeoutMs?: number;
  /**
   * Optional auto-responder, used by the dev playground (and available to
   * tests) to simulate a host answering a request -- e.g. a
   * 'run-poc-request' getting back a canned 'run-poc-result'. Return
   * `undefined` to not respond.
   */
  readonly responder?: (message: BridgeMessage) => BridgeMessage | undefined;
}

let requestCounter = 0;

/**
 * In-memory BridgeClient for tests and the dev/ playground. Records every
 * sent message on `.sent` so tests can assert against it, and exposes
 * `.emit()` so a test (or the responder option) can simulate the host
 * delivering a message back to the UI.
 */
export class MockBridgeClient implements BridgeClient {
  readonly sent: BridgeMessage[] = [];

  private readonly handlers = new Map<BridgeMessageType, Set<Handler>>();
  private readonly anyHandlers = new Set<Handler>();
  private readonly defaultTimeoutMs: number;
  private readonly responder?: (
    message: BridgeMessage,
  ) => BridgeMessage | undefined;

  constructor(options: MockBridgeClientOptions = {}) {
    this.defaultTimeoutMs = options.timeoutMs ?? 5000;
    this.responder = options.responder;
  }

  send(message: BridgeMessage): void {
    this.sent.push(message);
    if (this.responder) {
      const response = this.responder(message);
      if (response) {
        // Simulate the async round trip a real host would have.
        queueMicrotask(() => this.emit(response));
      }
    }
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

  /** Test/dev helper: simulate the host delivering `message` to the UI. */
  emit(message: BridgeMessage): void {
    const set = this.handlers.get(message.type);
    if (set) {
      for (const handler of [...set]) handler(message);
    }
    for (const handler of [...this.anyHandlers]) handler(message);
  }

  async request<TReq extends BridgeMessage, TRes extends BridgeMessage>(
    message: TReq,
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<TRes> {
    requestCounter += 1;
    const requestId = message.requestId ?? `mock-req-${requestCounter}`;
    const outgoing = { ...message, requestId } as TReq;

    return new Promise<TRes>((resolve, reject) => {
      const handler: Handler = (incoming) => {
        if (incoming.requestId !== requestId) return;
        cleanup();
        resolve(incoming as TRes);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `BridgeClient request timed out after ${timeoutMs}ms: ${message.type}`,
          ),
        );
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timer);
        this.anyHandlers.delete(handler);
      };

      this.anyHandlers.add(handler);
      this.send(outgoing);
    });
  }
}
