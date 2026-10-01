import * as vscode from "vscode";
import type { EngineHost } from "../engine/engineHost.js";
import { WhoAmIPanel } from "../panel/WhoAmIPanel.js";

export function registerOpenPanelCommand(
  context: vscode.ExtensionContext,
  engineHost: EngineHost,
): vscode.Disposable {
  const handler = () => {
    try {
      WhoAmIPanel.createOrShow(context, engineHost);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Codefy: Unable to open findings panel: ${msg}`);
      console.error("[Codefy] Open panel error:", err);
    }
  };
  const d1 = vscode.commands.registerCommand("codefy.openPanel", handler);
  const d2 = vscode.commands.registerCommand("whoami.openPanel", handler);
  const d3 = vscode.commands.registerCommand("codefy.focusSidebar", () => {
    void vscode.commands.executeCommand("codefy.findingsView.focus");
  });
  return vscode.Disposable.from(d1, d2, d3);
}
