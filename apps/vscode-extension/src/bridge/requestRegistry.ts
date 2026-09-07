/**
 * Generic requestId -> resolve/reject correlation map with a per-entry
 * timeout, mirroring the client-side pattern packages/ui's BridgeClient
 * implementations use (see packages/ui/src/bridge/MockBridgeClient.ts's
 * request()). extensionBridge.ts uses this for its own in-flight
 * long-running host-side work (a workspace scan) so a disposed panel
 * cleanly rejects anything still outstanding instead of leaking timers or
 * silently posting a result into a webview that no longer exists.
 */
export class RequestRegistry {
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  register<T>(requestId: string, timeoutMs = 120_000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cleanup(requestId);
        reject(
          new Error(`Request "${requestId}" timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      this.timers.set(requestId, timer);
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  resolve(requestId: string, value: unknown): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.cleanup(requestId);
    entry.resolve(value);
  }

  reject(requestId: string, error: Error): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    this.cleanup(requestId);
    entry.reject(error);
  }

  /** Reject every still-pending entry -- called when the owning panel is disposed. */
  rejectAll(error: Error): void {
    for (const requestId of [...this.pending.keys()]) {
      this.reject(requestId, error);
    }
  }

  private cleanup(requestId: string): void {
    const timer = this.timers.get(requestId);
    if (timer) clearTimeout(timer);
    this.timers.delete(requestId);
    this.pending.delete(requestId);
  }
}
