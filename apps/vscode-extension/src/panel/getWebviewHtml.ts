import * as crypto from "node:crypto";
import * as vscode from "vscode";

/**
 * Builds the webview's HTML shell. Strict CSP, nonce-gated script, assets
 * resolved via asWebviewUri() -- see CLAUDE.md Part 5 / the webview-bridge
 * skill. A fresh nonce is generated per panel creation (this function is
 * only called once, from WhoAmIPanel's constructor).
 */
export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const nonce = crypto.randomBytes(16).toString("base64");

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css"),
  );

  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}'`,
    // React's runtime injects inline styles for a handful of interactions
    // (focus rings, etc.) -- 'unsafe-inline' is scoped to style-src only,
    // never script-src.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `img-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource}`,
    // No network access from the webview -- everything it needs travels
    // over the postMessage bridge to the extension host instead.
    `connect-src 'none'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>WhoAmI Findings</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
