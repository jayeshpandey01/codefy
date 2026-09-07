import * as vscode from "vscode";
import type { EngineHost } from "../engine/engineHost.js";
import { ExtensionBridge } from "../bridge/extensionBridge.js";
import { getWebviewHtml } from "./getWebviewHtml.js";

/**
 * Singleton WebviewPanel mounting packages/ui inside the extension. Only
 * one findings panel exists at a time -- a second createOrShow() call just
 * reveals the existing one, per CLAUDE.md Part 5's `retainContextWhenHidden`
 * note (state should survive the panel being backgrounded, not be re-created).
 */
export class WhoAmIPanel {
  static readonly viewType = "whoami.findingsPanel";

  private static current: WhoAmIPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly bridge: ExtensionBridge;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    engineHost: EngineHost,
  ) {
    this.panel = panel;
    this.panel.webview.html = getWebviewHtml(this.panel.webview, extensionUri);
    this.bridge = new ExtensionBridge(this.panel, engineHost);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    engineHost: EngineHost,
  ): WhoAmIPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (WhoAmIPanel.current) {
      WhoAmIPanel.current.panel.reveal(column);
      return WhoAmIPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      WhoAmIPanel.viewType,
      "WhoAmI Findings",
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "dist", "webview"),
        ],
      },
    );

    WhoAmIPanel.current = new WhoAmIPanel(panel, extensionUri, engineHost);
    return WhoAmIPanel.current;
  }

  async triggerScan(rootPath: string): Promise<void> {
    await this.bridge.triggerScanWorkspace(rootPath);
  }

  dispose(): void {
    WhoAmIPanel.current = undefined;
    this.bridge.dispose();
    this.panel.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}
