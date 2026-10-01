import * as vscode from "vscode";
import type { EngineHost } from "../engine/engineHost.js";
import { ExtensionBridge } from "../bridge/extensionBridge.js";
import { getWebviewHtml } from "./getWebviewHtml.js";

/**
 * Sidebar WebviewViewProvider mounted in the Activity Bar container
 * (Primary Side Bar), providing instant access without requiring Cmd+Shift+P.
 */
export class CodefyViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codefy.findingsView";

  private _view?: vscode.WebviewView;
  private _bridge?: ExtensionBridge;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly engineHost: EngineHost,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _resolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
      ],
    };

    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.context.extensionUri,
    );

    this._bridge = new ExtensionBridge(
      webviewView,
      this.engineHost,
      this.context,
    );

    webviewView.onDidDispose(() => {
      this._bridge?.dispose();
      this._bridge = undefined;
      this._view = undefined;
    });
  }

  public async triggerScan(rootPath: string): Promise<void> {
    if (this._bridge) {
      await this._bridge.triggerScanWorkspace(rootPath);
    }
  }

  public focus(): void {
    if (this._view) {
      this._view.show(true);
    }
  }
}
