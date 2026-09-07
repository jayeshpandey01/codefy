import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@whoami/ui/styles.css";
import { BridgeProvider } from "@whoami/ui";
import { App } from "./App.js";
import { TauriBridgeClient } from "./bridge/TauriBridgeClient.js";

// TauriBridgeClient is constructed once, here, at the app root -- everything
// underneath (App, and every packages/ui component) only ever sees it
// through useBridge()/BridgeProvider, never Tauri's own APIs directly (see
// the webview-bridge skill's "no host-specific branching inside
// packages/ui" rule).
const client = new TauriBridgeClient();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <BridgeProvider client={client}>
      <App />
    </BridgeProvider>
  </StrictMode>,
);
