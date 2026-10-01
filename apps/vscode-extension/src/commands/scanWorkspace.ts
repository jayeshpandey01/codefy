import * as vscode from "vscode";
import type { EngineHost } from "../engine/engineHost.js";
import { WhoAmIPanel } from "../panel/WhoAmIPanel.js";

/**
 * whoami.scanWorkspace -- gets the current workspace folder, opens/reveals
 * the findings panel, and runs a full scan into it (progress surfaced via
 * both a VS Code notification and scan-workspace-progress BridgeMessages).
 */
export function registerScanWorkspaceCommand(
  context: vscode.ExtensionContext,
  engineHost: EngineHost,
): vscode.Disposable {
  const handler = async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      void vscode.window.showWarningMessage(
        "Codefy: open a folder or workspace before scanning.",
      );
      return;
    }

    const panel = WhoAmIPanel.createOrShow(context, engineHost);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Codefy: scanning workspace for security findings...",
        cancellable: false,
      },
      () => panel.triggerScan(folder.uri.fsPath),
    );
  };

  const d1 = vscode.commands.registerCommand("codefy.scanWorkspace", handler);
  const d2 = vscode.commands.registerCommand("whoami.scanWorkspace", handler);
  return vscode.Disposable.from(d1, d2);
}
