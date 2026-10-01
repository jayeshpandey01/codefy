import * as vscode from "vscode";
import type { EngineHost } from "../engine/engineHost.js";
import { WhoAmIPanel } from "../panel/WhoAmIPanel.js";

/** whoami.openPanel -- just shows the (singleton) findings panel. */
export function registerOpenPanelCommand(
  context: vscode.ExtensionContext,
  engineHost: EngineHost,
): vscode.Disposable {
  const handler = () => {
    WhoAmIPanel.createOrShow(context, engineHost);
  };
  const d1 = vscode.commands.registerCommand("codefy.openPanel", handler);
  const d2 = vscode.commands.registerCommand("whoami.openPanel", handler);
  return vscode.Disposable.from(d1, d2);
}
