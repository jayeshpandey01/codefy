import * as vscode from "vscode";
import { EngineHost } from "./engine/engineHost.js";
import { registerOpenPanelCommand } from "./commands/openPanel.js";
import { registerScanWorkspaceCommand } from "./commands/scanWorkspace.js";

export function activate(context: vscode.ExtensionContext): void {
  // One @whoami/core/node engine instance for the extension host's whole
  // lifetime -- see CLAUDE.md Part 5 and src/engine/engineHost.ts.
  const engineHost = new EngineHost();

  context.subscriptions.push(
    registerScanWorkspaceCommand(context, engineHost),
    registerOpenPanelCommand(context, engineHost),
  );
}

export function deactivate(): void {
  // Nothing to tear down: EngineHost holds no open handles/timers of its
  // own, and WhoAmIPanel's disposal is already driven by
  // vscode.WebviewPanel's onDidDispose via context.subscriptions.
}
