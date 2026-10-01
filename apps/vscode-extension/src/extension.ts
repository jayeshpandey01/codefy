import * as vscode from "vscode";
import { EngineHost } from "./engine/engineHost.js";
import { registerOpenPanelCommand } from "./commands/openPanel.js";
import { registerScanWorkspaceCommand } from "./commands/scanWorkspace.js";
import { registerSetApiKeyCommand } from "./commands/setApiKey.js";
import { computeUpdateNotice } from "./bridge/updateNotice.js";
import { WhoAmIPanel } from "./panel/WhoAmIPanel.js";
import { CodefyViewProvider } from "./panel/CodefyViewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
  const scanOutput = vscode.window.createOutputChannel("Codefy Scanner");
  // One @whoami/core/node engine instance for the extension host's whole
  // lifetime -- see CLAUDE.md Part 5 and src/engine/engineHost.ts.
  const engineHost = new EngineHost(scanOutput);

  // Activity Bar Sidebar Webview Provider (Left Navbar Icon)
  const viewProvider = new CodefyViewProvider(context, engineHost);
  const viewDisposable = vscode.window.registerWebviewViewProvider(
    CodefyViewProvider.viewType,
    viewProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    },
  );

  context.subscriptions.push(
    scanOutput,
    viewDisposable,
    registerScanWorkspaceCommand(context, engineHost),
    registerOpenPanelCommand(context, engineHost),
    registerSetApiKeyCommand(context),
  );

  // Status bar entry so the extension is visibly present once activated.
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  );
  statusBar.text = "$(shield) Codefy";
  statusBar.tooltip = "Codefy: Open Security Panel";
  statusBar.command = "codefy.findingsView.focus";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // VS Code installs extension updates on its own (no download/install step
  // for us to drive, unlike the desktop app) -- this only notices a version
  // bump since the last activation and announces it. See
  // docs/RELEASE-PIPELINE.md, Step 6. WhoAmIPanel.setPendingUpdateNotice
  // hands the same notice to whichever panel opens next (immediately, if
  // one is already open from a previous window reload, or later when the
  // user first opens it this session) -- see WhoAmIPanel.ts.
  try {
    const updateNotice = computeUpdateNotice(context);
    if (updateNotice && updateNotice.kind === "updated") {
      WhoAmIPanel.setPendingUpdateNotice(updateNotice);
      void vscode.window
        .showInformationMessage(`WhoAmI updated to ${updateNotice.to}`, "What's new")
        .then((pick) => {
          if (pick === "What's new") {
            WhoAmIPanel.createOrShow(context, engineHost);
          }
        });
    }
  } catch (err) {
    console.warn("[WhoAmI] Update notice check failed (non-fatal):", err);
  }
}

export function deactivate(): void {
  // Nothing to tear down: EngineHost holds no open handles/timers of its
  // own, and WhoAmIPanel's disposal is already driven by
  // vscode.WebviewPanel's onDidDispose via context.subscriptions.
}
