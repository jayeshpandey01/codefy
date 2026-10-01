import * as vscode from "vscode";

/**
 * Prompts the user to enter their Codefy API Key securely,
 * storing it in the encrypted VS Code SecretStorage (OS Keychain).
 */
export function registerSetApiKeyCommand(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const handler = async () => {
    const existing = await context.secrets.get("codefy.apiKey");
    const input = await vscode.window.showInputBox({
      title: "Codefy: Set Operator API Key",
      prompt: "Enter your Codefy API key for remote security scans and intelligence",
      password: true,
      value: existing || "",
      placeHolder: "Paste your API key here (e.g. key_...)",
      ignoreFocusOut: true,
    });

    if (input === undefined) {
      // User cancelled
      return;
    }

    const trimmed = input.trim();
    if (!trimmed) {
      await context.secrets.delete("codefy.apiKey");
      void vscode.window.showInformationMessage(
        "Codefy: API Key removed from secure storage.",
      );
    } else {
      await context.secrets.store("codefy.apiKey", trimmed);
      void vscode.window.showInformationMessage(
        "Codefy: API Key saved securely in OS Keychain.",
      );
    }
  };

  const d1 = vscode.commands.registerCommand("codefy.setApiKey", handler);
  const d2 = vscode.commands.registerCommand("whoami.setApiKey", handler);
  return vscode.Disposable.from(d1, d2);
}
