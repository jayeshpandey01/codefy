import * as vscode from "vscode";
import type { UpdateNotice } from "@whoami/types";
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

  /**
   * Set once by extension.ts's activate() when it detects a version bump,
   * consumed by the next (or already-open) panel's ExtensionBridge -- see
   * setPendingUpdateNotice below and docs/RELEASE-PIPELINE.md Step 6.
   */
  private static pendingUpdateNotice: UpdateNotice | null = null;

  private readonly panel: vscode.WebviewPanel;
  private readonly bridge: ExtensionBridge;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    engineHost: EngineHost,
  ) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "logo.svg");
    this.panel.webview.html = getWebviewHtml(this.panel.webview, context.extensionUri);
    this.bridge = new ExtensionBridge(
      this.panel,
      engineHost,
      context,
      WhoAmIPanel.pendingUpdateNotice,
    );
    // Consumed once -- a panel closed and reopened later in the same
    // session shouldn't re-announce the same update.
    WhoAmIPanel.pendingUpdateNotice = null;
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /** Called from extension.ts's activate() right after computeUpdateNotice()
   * returns a notice -- see the comment there. */
  static setPendingUpdateNotice(notice: UpdateNotice): void {
    WhoAmIPanel.pendingUpdateNotice = notice;
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    engineHost: EngineHost,
  ): WhoAmIPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (WhoAmIPanel.current) {
      WhoAmIPanel.current.panel.reveal(column);
      return WhoAmIPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      WhoAmIPanel.viewType,
      "Codefy Security",
      column ?? vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist", "webview"),
        ],
      },
    );

    WhoAmIPanel.current = new WhoAmIPanel(panel, context, engineHost);
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
