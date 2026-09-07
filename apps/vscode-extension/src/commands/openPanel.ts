import * as vscode from "vscode";
import type { EngineHost } from "../engine/engineHost.js";
import { WhoAmIPanel } from "../panel/WhoAmIPanel.js";

/** whoami.openPanel -- just shows the (singleton) findings panel. */
export function registerOpenPanelCommand(
  context: vscode.ExtensionContext,
  engineHost: EngineHost,
): vscode.Disposable {
  return vscode.commands.registerCommand("whoami.openPanel", () => {
    WhoAmIPanel.createOrShow(context.extensionUri, engineHost);
  });
}
