import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import type { BridgeClient } from "./BridgeClient.js";

const BridgeContext = createContext<BridgeClient | undefined>(undefined);

export interface BridgeProviderProps {
  readonly client: BridgeClient;
  readonly children: ReactNode;
}

/**
 * Provides the concrete BridgeClient at the app root. The VS Code extension
 * and Tauri desktop app each mount their own concrete implementation here;
 * packages/ui components underneath never know which one it is.
 */
export function BridgeProvider({
  client,
  children,
}: BridgeProviderProps): ReactElement {
  return (
    <BridgeContext.Provider value={client}>{children}</BridgeContext.Provider>
  );
}

export function useBridge(): BridgeClient {
  const client = useContext(BridgeContext);
  if (!client) {
    throw new Error(
      "useBridge() was called outside a <BridgeProvider>. The host app must inject a concrete " +
        "BridgeClient (or MockBridgeClient in tests/dev) at the root.",
    );
  }
  return client;
}
