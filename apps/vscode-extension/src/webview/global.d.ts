export {};

declare global {
  /** Injected into the webview's global scope by VS Code itself. */
  function acquireVsCodeApi<T = unknown>(): {
    postMessage(message: unknown): void;
    getState(): T | undefined;
    setState(state: T): void;
  };
}

// '@whoami/ui/styles.css' resolves through @whoami/ui's package.json
// "exports" map, which has no "types" condition for that subpath (it's a
// plain CSS asset) -- TypeScript needs an ambient module declaration to
// accept the side-effect import in src/webview/main.tsx.
declare module "*.css";
