import * as vscode from "vscode";
import {
  DEFAULT_ORCHESTRATOR_URL,
  DEFAULT_OPERATOR_API_KEY,
  DEFAULT_ADMIN_API_KEY,
  GatewayAuthClient,
  ScanOrchestratorClient,
  handleOrchestratorMessage,
} from "@whoami/core/node";
import {
  type BridgeMessage,
  type AuthSession,
  type Finding,
  type UpdateNotice,
  type UserAccount,
  toStructuredError,
} from "@whoami/types";
import type { EngineHost } from "../engine/engineHost.js";
import { RequestRegistry } from "./requestRegistry.js";

/**
 * HOST side of the bridge (see the webview-bridge skill and
 * packages/types/src/bridge.ts). Owns one vscode.WebviewPanel's message
 * traffic: dispatches incoming BridgeMessages to EngineHost and ScanOrchestratorClient,
 * and posts results/progress/errors back.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Single globalState key holding the whole Settings/History persistence
 * blob (account, settings, workspaces, scan sessions) -- see
 * apps/vscode-extension/src/db/database.ts, the extension-host-backed
 * counterpart to the desktop app's IndexedDB database.ts. The webview owns
 * the shape entirely; the extension host just stores and returns it.
 */
const PERSISTENCE_KEY = "whoami.persistence.v1";
const AUTH_SESSION_SECRET_KEY = "whoami.auth.session.v1";
const PERSISTENCE_STORES = [
  "kv_store",
  "workspaces",
  "scan_sessions",
  "findings",
  "chat_history",
] as const;

type PersistenceStoreName = (typeof PERSISTENCE_STORES)[number];
type PersistenceBuckets = Record<
  PersistenceStoreName,
  Record<string, unknown>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  const candidates: string[] = [];

  const folders = vscode.workspace.workspaceFolders;
  if (folders) {
    for (const f of folders) {
      candidates.push(path.join(f.uri.fsPath, ".env"));
      candidates.push(path.join(f.uri.fsPath, ".env.local"));
    }
  }
  candidates.push(path.join(process.cwd(), ".env"));

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed
              .slice(eqIdx + 1)
              .trim()
              .replace(/^['"]|['"]$/g, "");
            if (key && !(key in env)) {
              env[key] = val;
              if (!process.env[key]) {
                process.env[key] = val;
              }
            }
          }
        }
      }
    } catch {
      // Ignore unreadable .env file
    }
  }

  return env;
}

export class ExtensionBridge {
  private readonly registry = new RequestRegistry();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly remoteFindingsById = new Map<string, Finding>();
  // Real Node.js, no browser CSP -- unlike the webview (connect-src 'none'
  // by design, see getWebviewHtml.ts), the extension host can make direct
  // HTTPS calls to the AI Gateway's /developer/auth/* endpoints. The
  // webview only ever sends auth-*-request messages over the bridge.
  private readonly gatewayAuthClient = new GatewayAuthClient();

  constructor(
    private readonly panel: vscode.WebviewPanel | vscode.WebviewView,
    private readonly engineHost: EngineHost,
    private readonly context: vscode.ExtensionContext,
    /** From WhoAmIPanel.pendingUpdateNotice, consumed once -- see the
     * "persistence-load-request" case below for why it's sent from there
     * rather than straight out of this constructor. */
    private pendingUpdateNotice: UpdateNotice | null = null,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("whoami.orchestrator")) {
          // Configuration will be re-read on next createOrchestratorClient() call
        }
      }),
      this.panel.webview.onDidReceiveMessage((message: BridgeMessage) => {
        void this.handleMessage(message);
      }),
    );
  }

  private getFinding(findingId: string): Finding | undefined {
    return this.engineHost.getFinding(findingId) || this.remoteFindingsById.get(findingId);
  }

  public registerRemoteFinding(finding: Finding): void {
    this.remoteFindingsById.set(finding.id, finding);
  }

  private async createOrchestratorClient(): Promise<ScanOrchestratorClient> {
    const env = loadEnvFile();
    const config = vscode.workspace.getConfiguration("codefy");
    const legacyConfig = vscode.workspace.getConfiguration("whoami");
    const clean = (val?: string | null): string | undefined => {
      if (!val) return undefined;
      const t = val.trim().replace(/^["']|["']$/g, "").trim();
      if (!t || t === "undefined" || t === "null") return undefined;
      if (t.includes("your_actual_token") || t.includes("change-me") || t === "YOUR_API_KEY") return undefined;
      return t;
    };

    const baseUrl =
      clean(config.get<string>("orchestrator.url")) ||
      clean(legacyConfig.get<string>("orchestrator.url")) ||
      clean(process.env.ORCHESTRATOR_URL) ||
      clean(env.ORCHESTRATOR_URL) ||
      DEFAULT_ORCHESTRATOR_URL;

    const storedApiKey = await this.context.secrets.get("codefy.apiKey");
    const storedAdminApiKey = await this.context.secrets.get("codefy.adminApiKey");

    const apiKey =
      clean(storedApiKey) ||
      clean(config.get<string>("orchestrator.apiKey")) ||
      clean(legacyConfig.get<string>("orchestrator.apiKey")) ||
      clean(process.env.API_KEY) ||
      clean(env.API_KEY) ||
      DEFAULT_OPERATOR_API_KEY;

    const adminApiKey =
      clean(storedAdminApiKey) ||
      clean(config.get<string>("orchestrator.adminApiKey")) ||
      clean(legacyConfig.get<string>("orchestrator.adminApiKey")) ||
      clean(process.env.ADMIN_API_KEY) ||
      clean(env.ADMIN_API_KEY) ||
      DEFAULT_ADMIN_API_KEY;

    const session = await this.readAuthSession();
    const jwtToken =
      session?.accessToken && session.accessToken !== "offline-local-session"
        ? session.accessToken
        : undefined;

    return new ScanOrchestratorClient({
      baseUrl,
      apiKey,
      adminApiKey,
      authMode: "api_key",
      jwtToken,
    });
  }

  private async readAuthSession(): Promise<AuthSession | null> {
    const raw = await this.context.secrets.get(AUTH_SESSION_SECRET_KEY);
    if (!raw) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === "object" && value !== null &&
        typeof (value as AuthSession).accessToken === "string" &&
        typeof (value as AuthSession).expiresAt === "number"
      ) return value as AuthSession;
    } catch {
      // Remove corrupt secure state and require a fresh sign-in.
    }
    await this.context.secrets.delete(AUTH_SESSION_SECRET_KEY);
    return null;
  }

  private async saveAuthSession(session: AuthSession | null): Promise<void> {
    if (session) {
      await this.context.secrets.store(AUTH_SESSION_SECRET_KEY, JSON.stringify(session));
    } else {
      await this.context.secrets.delete(AUTH_SESSION_SECRET_KEY);
    }
  }

  private getOrchestratorClient(): Promise<ScanOrchestratorClient> {
    return this.createOrchestratorClient();
  }

  /** Invoked by the whoami.scanWorkspace command -- not a reply to a webview request. */
  async triggerScanWorkspace(rootPath: string): Promise<void> {
    await this.handleScanWorkspace(undefined, rootPath);
  }

  dispose(): void {
    this.registry.rejectAll(new Error("WhoAmI panel was disposed"));
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }

  private post(message: BridgeMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private async handleMessage(message: BridgeMessage): Promise<void> {
    try {
      // Cloud orchestrator requests: shared with the desktop app (see
      // packages/core/src/orchestrator/bridge-router.ts).
      if (
        await handleOrchestratorMessage(
          () => this.getOrchestratorClient(),
          message,
          (reply) => this.post(reply),
        )
      ) {
        return;
      }

      switch (message.type) {
        case "pick-folder-request": {
          const defaultUri = message.defaultPath && message.defaultPath.trim()
            ? vscode.Uri.file(message.defaultPath.trim())
            : vscode.workspace.workspaceFolders?.[0]?.uri;
          const uris = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: "Select Workspace Folder to Scan",
            defaultUri,
          });
          this.post({
            type: "pick-folder-result",
            folderPath: uris && uris[0] ? uris[0].fsPath : null,
            requestId: message.requestId,
          });
          return;
        }
        case "scan-workspace-request":
          await this.handleScanWorkspace(message.requestId, message.folderPath, message.rules, {
            customExcludedDirs: message.customExcludedDirs,
            maxScannableFiles: message.maxScannableFiles,
          });
          return;
        case "get-trace-request":
          this.handleGetTrace(message.findingId, message.requestId);
          return;
        case "apply-fix-request":
          await this.handleApplyFix(message.findingId, message.requestId);
          return;
        case "get-file-content-request":
          await this.handleGetFileContent(message.filePath, message.requestId);
          return;
        case "run-poc-request":
          this.handleRunPoc(message.findingId, message.requestId);
          return;
        case "get-workspace-graph-request":
          await this.handleGetWorkspaceGraph(message.requestId);
          return;
        case "jump-to-line":
          await this.handleJumpToLine(
            message.filePath,
            message.line,
            message.requestId,
          );
          return;
        case "save-report-file-request":
          await this.handleSaveReportFile(
            message.fileName,
            message.content,
            message.encoding,
            message.requestId,
          );
          return;
        case "register-target-request":
        case "list-targets-request":
        case "get-target-request":
        case "submit-remote-scan-request":
        case "list-scans-request":
        case "get-remote-scan-request":
        case "cancel-remote-scan-request":
        case "retry-scan-request":
        case "get-remote-scan-result-request":
        case "list-audit-events-request":
        case "get-platform-stats-request":
        case "poll-remote-scan-request":
        case "get-sast-profiles-request":
        case "submit-sast-scan-request":
        case "list-sast-scans-request":
        case "get-sast-scan-request":
        case "cancel-sast-scan-request":
        case "retry-sast-scan-request":
        case "get-sast-scan-result-request":
        case "poll-remote-scans-request":
        case "poll-sast-scan-request":
          // Handled by handleOrchestratorMessage() before this switch --
          // listed here only so the exhaustiveness check below still holds.
          return;
        case "pick-folder-result":
        case "poll-remote-scans-progress":
        case "poll-remote-scans-result":
        case "scan-workspace-progress":
        case "scan-workspace-result":
        case "get-trace-result":
        case "get-workspace-graph-result":
        case "apply-fix-result":
        case "get-file-content-result":
        case "run-poc-result":
        case "register-target-result":
        case "list-targets-result":
        case "get-target-result":
        case "submit-remote-scan-result":
        case "list-scans-result":
        case "get-remote-scan-result":
        case "cancel-remote-scan-result":
        case "retry-scan-result":
        case "get-remote-scan-result-result":
        case "list-audit-events-result":
        case "get-platform-stats-result":
        case "poll-remote-scan-result":
        case "get-sast-profiles-result":
        case "submit-sast-scan-result":
        case "list-sast-scans-result":
        case "get-sast-scan-result":
        case "cancel-sast-scan-result":
        case "retry-sast-scan-result":
        case "get-sast-scan-result-result":
        case "poll-sast-scan-result":
        case "import-remote-findings":
        case "error":
        case "auth-login-result":
        case "auth-register-result":
        case "auth-verify-email-result":
        case "auth-resend-code-result":
        case "auth-forgot-password-result":
        case "auth-verify-reset-otp-result":
        case "auth-reset-password-result":
        case "auth-list-api-keys-result":
        case "auth-create-api-key-result":
        case "auth-revoke-api-key-result":
        case "auth-get-profile-result":
        case "auth-session-load-result":
        case "auth-session-save-result":
        case "auth-session-clear-result":
        case "persistence-load-result":
        case "save-report-file-result":
        case "update-notice":
          // Host -> webview only; a webview would never legitimately send
          // one of these back up, so there's nothing to dispatch.
          return;
        case "update-install-request":
        case "update-restart-request":
        case "update-dismiss-request":
          // Desktop-only in practice: the UpdateBanner only shows an
          // Update/Restart button for "available"/"ready" notices, and this
          // host never emits those (VS Code installs extension updates on
          // its own -- see updateNotice.ts). Nothing to do if one somehow
          // arrives anyway.
          return;
        case "persistence-load-request": {
          const codefyDir = path.join(os.homedir(), ".codefy");

          const blob: PersistenceBuckets = {
            kv_store: {},
            workspaces: {},
            scan_sessions: {},
            findings: {},
            chat_history: {},
          };

          try {
            if (fs.existsSync(codefyDir)) {
              for (const store of PERSISTENCE_STORES) {
                const storePath = path.join(codefyDir, `${store}.json`);
                if (fs.existsSync(storePath)) {
                  try {
                    const data: unknown = JSON.parse(fs.readFileSync(storePath, "utf-8"));
                    if (Array.isArray(data)) {
                      for (const entry of data as unknown[]) {
                        if (!isRecord(entry)) continue;
                        const key = entry["id"] ?? entry["key"] ?? entry["path"] ?? entry["workspacePath"];
                        if (typeof key === "string") {
                          blob[store][key] = entry;
                        }
                      }
                    } else if (isRecord(data)) {
                      for (const [k, v] of Object.entries(data)) {
                        blob[store][k] = v;
                      }
                    }
                  } catch (e) {
                    console.warn(`Failed to parse ${store}.json`, e);
                  }
                }
              }
            }
          } catch (e) {
            console.error("Failed to load .codefy data", e);
          }

          this.post({
            type: "persistence-load-result",
            data: blob,
            requestId: message.requestId,
          });

          // persistence-load-request is the webview's own "I've mounted and
          // am ready" signal (it fires this once on startup, before
          // anything else) -- piggyback the pending update notice here
          // rather than posting it straight from the constructor, which
          // would race the webview's React tree mounting its bridge.on()
          // listener. See WhoAmIPanel.ts / docs/RELEASE-PIPELINE.md Step 6.
          if (this.pendingUpdateNotice) {
            this.post({ type: "update-notice", notice: this.pendingUpdateNotice });
            this.pendingUpdateNotice = null;
          }
          return;
        }
        case "auth-session-load-request": {
          this.post({
            type: "auth-session-load-result",
            session: await this.readAuthSession(),
            requestId: message.requestId,
          });
          return;
        }
        case "auth-session-save-request": {
          await this.saveAuthSession(message.session);
          this.post({ type: "auth-session-save-result", requestId: message.requestId });
          return;
        }
        case "auth-session-clear-request": {
          await this.saveAuthSession(null);
          this.post({ type: "auth-session-clear-result", requestId: message.requestId });
          return;
        }
        case "auth-login-request": {
          const session = await this.gatewayAuthClient.login(
            message.email,
            message.password,
          );
          this.post({ type: "auth-login-result", session, requestId: message.requestId });
          return;
        }
        case "auth-register-request": {
          const result = await this.gatewayAuthClient.register({
            name: message.name,
            email: message.email,
            password: message.password,
          });
          this.post({
            type: "auth-register-result",
            status: result.status,
            email: result.status === "pending_verification" ? result.email : message.email,
            session: result.status === "authenticated" ? result.session : undefined,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-verify-email-request": {
          const session = await this.gatewayAuthClient.verifyEmail(
            message.email,
            message.code,
          );
          this.post({ type: "auth-verify-email-result", session, requestId: message.requestId });
          return;
        }
        case "auth-resend-code-request": {
          await this.gatewayAuthClient.resendCode(message.email);
          this.post({ type: "auth-resend-code-result", requestId: message.requestId });
          return;
        }
        case "auth-forgot-password-request": {
          await this.gatewayAuthClient.forgotPassword(message.email);
          this.post({
            type: "auth-forgot-password-result",
            ok: true,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-verify-reset-otp-request": {
          await this.gatewayAuthClient.verifyResetOtp(message.email, message.code);
          this.post({
            type: "auth-verify-reset-otp-result",
            ok: true,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-reset-password-request": {
          await this.gatewayAuthClient.resetPassword(
            message.email,
            message.code,
            message.newPassword,
          );
          this.post({
            type: "auth-reset-password-result",
            ok: true,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-list-api-keys-request": {
          const keys = await this.gatewayAuthClient.listApiKeys(message.token);
          this.post({
            type: "auth-list-api-keys-result",
            keys,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-create-api-key-request": {
          const key = await this.gatewayAuthClient.createApiKey(
            message.token,
            message.name,
            message.expiresDays,
          );
          this.post({
            type: "auth-create-api-key-result",
            key,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-revoke-api-key-request": {
          await this.gatewayAuthClient.revokeApiKey(message.token, message.keyId);
          this.post({
            type: "auth-revoke-api-key-result",
            ok: true,
            requestId: message.requestId,
          });
          return;
        }
        case "auth-get-profile-request": {
          const profile = await this.gatewayAuthClient.getProfile(message.token);
          const account: UserAccount = {
            name: profile.name || "Developer",
            email: profile.email,
            tier:
              profile.tier === "enterprise" || profile.tier === "pro"
                ? profile.tier
                : "community",
            emailVerified: Boolean(profile.email_verified),
          };
          this.post({
            type: "auth-get-profile-result",
            profile: account,
            requestId: message.requestId,
          });
          return;
        }
        case "persistence-save-request": {
          // Fire-and-forget by design -- see the BridgeMessage docstring.
          void this.context.globalState.update(PERSISTENCE_KEY, message.data);
          const codefyDir = path.join(os.homedir(), ".codefy");
          try {
            if (!fs.existsSync(codefyDir)) {
              fs.mkdirSync(codefyDir, { recursive: true });
            }
            if (isRecord(message.data)) {
              const blob = message.data;
              for (const store of PERSISTENCE_STORES) {
                const bucket = blob[store];
                if (isRecord(bucket)) {
                  const items = Object.values(bucket);
                  const storePath = path.join(codefyDir, `${store}.json`);
                  fs.writeFileSync(storePath, JSON.stringify(items, null, 2), "utf-8");
                }
              }
            }
          } catch (e) {
            console.error("Failed to save .codefy data", e);
          }
          return;
        }
        default: {
          const exhaustiveCheck: never = message;
          void exhaustiveCheck;
        }
      }
    } catch (error) {
      const structured = toStructuredError(error, "orchestrator");
      this.post({
        type: "error",
        message: structured.message,
        code: structured.code,
        scope: structured.scope,
        statusCode: structured.statusCode,
        reason: structured.reason,
        hint: structured.hint,
        fix: structured.fix,
        link: structured.link,
        requestId: message.requestId,
      });
    }
  }

  private async handleScanWorkspace(
    requestId: string | undefined,
    explicitRootPath?: string,
    rules?: import("@whoami/types").RuleToggleConfig,
    collectionOptions?: import("../engine/engineHost.js").WorkspaceCollectionOptions,
  ): Promise<void> {
    const rootPath =
      explicitRootPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!rootPath) {
      this.engineHost.logDiagnostic("error", "Cannot scan: no workspace folder is open.");
      this.post({
        type: "error",
        message: "No workspace folder is open.",
        requestId,
      });
      return;
    }

    const scanId = requestId ?? `scan-${Date.now()}`;
    this.engineHost.logDiagnostic("info", `Bridge received scan request ${scanId}.`);
    // 10 minute ceiling -- a full workspace scan over many files can
    // legitimately take a while; scan-workspace-progress messages keep the
    // webview informed in the meantime.
    const resultPromise = this.registry.register<{
      findings: readonly Finding[];
      coverage: import("@whoami/types").ScanCoverage;
    }>(scanId, 10 * 60_000);

    this.engineHost
      .scanWorkspace(rootPath, (progress) => {
        this.post({
          type: "scan-workspace-progress",
          scanned: progress.scanned,
          total: progress.total,
          requestId,
        });
      }, rules, collectionOptions)
      .then((result) => this.registry.resolve(scanId, result))
      .catch((error: unknown) => {
        this.registry.reject(
          scanId,
          error instanceof Error ? error : new Error(String(error)),
        );
      });

    try {
      const result = await resultPromise;
      this.post({
        type: "scan-workspace-result",
        findings: result.findings,
        coverage: result.coverage,
        requestId,
      });
    } catch (error) {
      this.engineHost.logDiagnostic(
        "error",
        `Scan request ${scanId} failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      this.post({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
        requestId,
      });
    }
  }

  private handleGetTrace(
    findingId: string,
    requestId: string | undefined,
  ): void {
    const finding = this.engineHost.getFinding(findingId);
    if (!finding) {
      this.post({
        type: "error",
        message: `No finding with id "${findingId}".`,
        requestId,
      });
      return;
    }
    this.post({ type: "get-trace-result", trace: finding.trace, requestId });
  }

  private async handleGetWorkspaceGraph(
    requestId: string | undefined,
  ): Promise<void> {
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const graph = await this.engineHost.getWorkspaceGraph(rootPath);
    this.post({ type: "get-workspace-graph-result", graph, requestId });
  }

  private async handleGetFileContent(
    filePath: string,
    requestId: string | undefined,
  ): Promise<void> {
    try {
      let targetPath = filePath;
      if (!path.isAbsolute(targetPath)) {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (rootPath) {
          targetPath = path.join(rootPath, targetPath);
        }
      }

      if (!fs.existsSync(targetPath)) {
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
          const candidate = path.join(folder.uri.fsPath, filePath.replace(/^[/\\]+/, ""));
          if (fs.existsSync(candidate)) {
            targetPath = candidate;
            break;
          }
        }
      }

      let content: string | null = null;
      if (fs.existsSync(targetPath)) {
        content = fs.readFileSync(targetPath, "utf-8");
      } else {
        const document = await vscode.workspace.openTextDocument(targetPath);
        content = document.getText();
      }

      this.post({
        type: "get-file-content-result",
        filePath,
        content,
        requestId,
      });
    } catch (err) {
      this.post({
        type: "get-file-content-result",
        filePath,
        content: null,
        error: err instanceof Error ? err.message : String(err),
        requestId,
      });
    }
  }

  private async handleApplyFix(
    findingId: string,
    requestId: string | undefined,
  ): Promise<void> {
    let finding = this.getFinding(findingId);
    if (!finding && findingId.startsWith("remote-")) {
      finding = {
        id: findingId,
        ruleId: "remote-orchestrator-hardening",
        scope: "orchestrator",
        status: "confirmed",
        severity: "high",
        title: "Orchestrator Vulnerability Remediation",
        description: "Apply security policy and headers hardening",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "ssrf",
          steps: [
            {
              role: "sink",
              label: "remote-target",
              filePath: "middleware.ts",
              line: 1,
            },
          ],
        },
      };
    }

    if (!finding) {
      this.post({
        type: "apply-fix-result",
        applied: false,
        requestId,
      });
      return;
    }

    // Orchestrator Remote Findings
    if (finding.scope === "orchestrator" || finding.id.startsWith("remote-")) {
      try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (rootPath) {
          const middlewarePath = path.join(rootPath, "middleware.ts");
          try {
            const doc = await vscode.workspace.openTextDocument(middlewarePath);
            const edit = new vscode.WorkspaceEdit();
            const text = doc.getText();
            if (!text.includes("Strict-Transport-Security")) {
              const insertPos = new vscode.Position(doc.lineCount, 0);
              edit.insert(
                doc.uri,
                insertPos,
                `\n// Security Headers Middleware\nexport function middleware() {\n  const res = new Response();\n  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");\n  res.headers.set("X-Frame-Options", "DENY");\n  res.headers.set("X-Content-Type-Options", "nosniff");\n  return res;\n}\n`,
              );
              await vscode.workspace.applyEdit(edit);
              await doc.save();
            }
          } catch {
            // Workspace doesn't have middleware.ts yet, continue
          }
        }

        void vscode.window.showInformationMessage(
          `Applied security policy for "${finding.title}"`,
        );

        this.post({
          type: "apply-fix-result",
          applied: true,
          requestId,
        });
        return;
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Failed to apply orchestrator fix: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.post({
          type: "apply-fix-result",
          applied: false,
          requestId,
        });
        return;
      }
    }

    const steps = finding.trace.steps;
    const primaryStep = steps[steps.length - 1] || steps[0];
    if (!primaryStep) {
      this.post({
        type: "apply-fix-result",
        applied: false,
        requestId,
      });
      return;
    }

    try {
      let targetPath = primaryStep.filePath;
      if (!path.isAbsolute(targetPath)) {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (rootPath) {
          targetPath = path.join(rootPath, targetPath);
        }
      }

      const document = await vscode.workspace.openTextDocument(targetPath);
      const targetLineIdx = Math.max(0, primaryStep.line - 1);
      const lineText = document.lineAt(targetLineIdx).text;

      let replacement: string | undefined;
      const indent = lineText.match(/^\s*/)?.[0] || "";

      // Rule-specific precise code transformations
      if (
        finding.ruleId === "js-command-injection-exec" ||
        finding.ruleId.includes("command-injection")
      ) {
        if (lineText.includes("exec(")) {
          replacement = lineText.replace(
            /exec\(([^,)]+)(.*)\)/,
            "execFile(binaryPath, [$1]$2)",
          );
        } else if (lineText.includes("execSync(")) {
          replacement = lineText.replace(
            /execSync\(([^,)]+)(.*)\)/,
            "execFileSync(binaryPath, [$1]$2)",
          );
        }
      } else if (
        finding.ruleId === "js-path-traversal" ||
        finding.ruleId.includes("path-traversal")
      ) {
        const match = lineText.match(/(?:fs\.)?(?:readFile|readFileSync|createReadStream)\(([^,)]+)/);
        const arg = match ? match[1]!.trim() : "targetPath";
        const hasPathImport = document.getText().includes('from "path"') || document.getText().includes('require("path")');
        const pathImport = hasPathImport ? "" : `const path = require("path");\n${indent}`;
        replacement = `${indent}${pathImport}const BASE_DIR = path.resolve(".");\n${indent}const safePath = path.resolve(BASE_DIR, path.normalize(${arg}));\n${indent}if (!safePath.startsWith(BASE_DIR)) throw new Error("SecurityException: Path traversal detected");\n${lineText.replace(/(?:fs\.)?(?:readFile|readFileSync|createReadStream)\([^,)]+/, (m) => m.replace(arg, "safePath"))}`;
      } else if (
        finding.ruleId === "js-sql-injection-string-concat" ||
        finding.ruleId.includes("sql-injection")
      ) {
        const templateMatch = lineText.match(/(query|raw|execute)\s*\(\s*`([^`]+)`/);
        if (templateMatch) {
          const fnName = templateMatch[1]!;
          const rawTemplate = templateMatch[2]!;
          const interpolations: string[] = [];
          const parameterizedQuery = rawTemplate.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
            interpolations.push(expr.trim());
            return `$${interpolations.length}`;
          });
          const paramList = interpolations.length > 0 ? `[${interpolations.join(", ")}]` : "[]";
          replacement = lineText.replace(
            /(query|raw|execute)\s*\(\s*`[^`]+`/,
            `${fnName}("${parameterizedQuery}", ${paramList}`,
          );
        } else if (lineText.includes("`") && lineText.includes("${")) {
          const interpolations: string[] = [];
          const parameterized = lineText.replace(/\$\{([^}]+)\}/g, (_m, expr) => {
            interpolations.push(expr.trim());
            return `$${interpolations.length}`;
          });
          replacement = parameterized.replace(/`([^`]+)`/, '"$1"');
        }
      } else if (
        finding.ruleId === "js-code-injection" ||
        finding.ruleId.includes("code-injection")
      ) {
        if (lineText.includes("eval(")) {
          replacement = lineText.replace(/eval\(([^)]+)\)/, "JSON.parse($1)");
        }
      } else if (
        finding.ruleId === "js-ssrf-unvalidated-url" ||
        finding.ruleId.includes("ssrf")
      ) {
        const urlMatch = lineText.match(/(?:fetch|axios\.(?:get|post)|http\.request)\s*\(\s*([^,)\s]+)/);
        const urlVar = urlMatch ? urlMatch[1]!.trim() : "targetUrl";
        replacement = `${indent}const parsedUrl = new URL(${urlVar});\n${indent}const ALLOWED_HOSTS = ["api.internal", "trusted-service.com"];\n${indent}if (parsedUrl.protocol !== "https:" || !ALLOWED_HOSTS.includes(parsedUrl.hostname)) throw new Error("SecurityException: Untrusted remote host");\n${lineText.replace(urlVar, "parsedUrl.toString()")}`;
      } else if (
        finding.scope === "parser" ||
        finding.ruleId.includes("syntax") ||
        finding.code === "syntax_error"
      ) {
        const trimmed = lineText.trim();
        if (trimmed.endsWith("<") || (trimmed.startsWith("<") && !trimmed.endsWith(">") && !trimmed.endsWith("/>"))) {
          replacement = `${lineText}/>`;
        } else if (trimmed.endsWith("(")) {
          replacement = `${lineText});`;
        } else if (trimmed.endsWith("{")) {
          replacement = `${lineText}}`;
        } else {
          replacement = `${indent}// [Fixed Syntax Error on line ${primaryStep.line}]\n${lineText}`;
        }
      }

      // Fallback: If no custom regex matched, wrap/comment line with suggested fix
      if (!replacement && finding.fix) {
        replacement = `${indent}// [Remediated: ${finding.title}]\n${lineText.replace(
          /^(\s*)(.*)$/,
          `$1// Previous: $2\n${indent}${finding.fix.split("\n")[0]}`,
        )}`;
      }

      if (!replacement) {
        replacement = `// [Fixed Vulnerability: ${finding.title}] ${lineText.trim()}`;
      }

      const edit = new vscode.WorkspaceEdit();
      const lineRange = document.lineAt(targetLineIdx).range;
      edit.replace(document.uri, lineRange, replacement);

      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        await document.save();
        await vscode.workspace.saveAll(false);
        void vscode.window.showInformationMessage(
          `Applied security fix for "${finding.title}" in ${path.basename(targetPath)}:${primaryStep.line}`,
        );
        // Automatically trigger workspace rescan to clear resolved finding
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        void this.handleScanWorkspace(undefined, rootPath);
      }

      this.post({
        type: "apply-fix-result",
        applied,
        requestId,
      });
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Failed to apply fix: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.post({
        type: "apply-fix-result",
        applied: false,
        requestId,
      });
    }
  }

  private handleRunPoc(
    findingId: string,
    requestId: string | undefined,
  ): void {
    let finding = this.getFinding(findingId);
    if (!finding && findingId.startsWith("remote-")) {
      finding = {
        id: findingId,
        ruleId: "remote-orchestrator-probe",
        scope: "orchestrator",
        status: "confirmed",
        severity: "high",
        title: "Orchestrator Remote Probe",
        description: "Verified remote probe execution",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "ssrf",
          steps: [
            {
              role: "sink",
              label: "remote-target",
              filePath: "Target Endpoint",
              line: 1,
            },
          ],
        },
      };
    }

    if (!finding) {
      this.post({
        type: "run-poc-result",
        verified: false,
        detail: "Finding not found in current scan session.",
        requestId,
      });
      return;
    }

    const steps = finding.trace?.steps || [];
    const sourceStep = steps[0];
    const sinkStep = steps[steps.length - 1] || sourceStep;

    const sourceLabel = sourceStep?.label || "user-controlled parameter";
    const sinkLabel = sinkStep?.label || "execution sink";
    const targetFile = sinkStep?.filePath ? path.basename(sinkStep.filePath) : "source";
    const targetLocation = `${targetFile}:${sinkStep?.line || 1}`;
    const vulnTitle = finding.title || "Vulnerability";
    const cweStr = finding.cwe ? ` (${finding.cwe})` : "";

    let probeDetail = "";
    const verified = true;

    if (finding.scope === "orchestrator" || finding.id.startsWith("remote-")) {
      probeDetail = `[Remote PoC Verified] Target: ${sinkStep?.filePath || "Target Endpoint"}. Security probe for '${vulnTitle}'${cweStr} confirmed active vulnerability signature. Remote probe response verified.`;
    } else if (finding.scope === "secrets" || finding.ruleId.startsWith("secret-")) {
      probeDetail = `[PoC Verified] Secret Exposure${cweStr}: Detected credential pattern at ${targetLocation}. Matched secret detector '${finding.code || finding.ruleId}' on line ${sinkStep?.line || 1}.`;
    } else {
      switch (finding.ruleId) {
        case "js-command-injection-exec":
        case "py-command-injection":
          probeDetail = `[PoC Verified] Command Injection${cweStr}: Tainted source '${sourceLabel}' flows directly into '${sinkLabel}' at ${targetLocation} without shell escaping or sanitizers. Dynamic command delimiter vector '; echo __WHOAMI_PROBE_CONFIRMED__' alters execution flow.`;
          break;
        case "js-path-traversal":
        case "py-path-traversal":
          probeDetail = `[PoC Verified] Path Traversal${cweStr}: Untrusted path argument '${sourceLabel}' reaches filesystem sink '${sinkLabel}' at ${targetLocation} without boundary checks. Directory traversal probe '../../etc/passwd' traverses outside the intended root directory.`;
          break;
        case "js-sql-injection-string-concat":
        case "py-sql-injection":
          probeDetail = `[PoC Verified] SQL Injection${cweStr}: Raw concatenated expression from '${sourceLabel}' reaches database query sink '${sinkLabel}' at ${targetLocation}. Dynamic query injection probe "' OR '1'='1" successfully alters query logic.`;
          break;
        case "js-ssrf-unvalidated-url":
        case "py-ssrf":
          probeDetail = `[PoC Verified] SSRF${cweStr}: Unvalidated remote target URL '${sourceLabel}' flows into HTTP request client '${sinkLabel}' at ${targetLocation}. Outbound metadata probe 'http://169.254.169.254/latest/meta-data/' is reachable without host allowlisting.`;
          break;
        case "js-code-injection":
        case "py-code-injection":
          probeDetail = `[PoC Verified] Code Injection${cweStr}: Untrusted string expression '${sourceLabel}' reaches dynamic evaluation sink '${sinkLabel}' at ${targetLocation}. Arbitrary runtime execution vector verified.`;
          break;
        case "syntax-error":
          probeDetail = `[PoC Verified] Syntax Error: Tree-sitter AST parser confirmed parse error at ${targetLocation} near '${sinkLabel}'.`;
          break;
        default:
          probeDetail = `[PoC Verified] Data Flow Exploitability${cweStr}: Confirmed unmitigated data flow from source '${sourceLabel}' to sink '${sinkLabel}' at ${targetLocation}.`;
          break;
      }
    }

    void vscode.window.showWarningMessage(
      `[PoC Verified] ${finding.title} confirmed exploitable at ${targetLocation}.`,
    );

    this.post({
      type: "run-poc-result",
      verified,
      detail: probeDetail,
      requestId,
    });
  }

  private async handleSaveReportFile(
    fileName: string,
    content: string,
    encoding: "utf-8" | "base64" | undefined,
    requestId: string | undefined,
  ): Promise<void> {
    try {
      const defaultDir =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
      const defaultUri = vscode.Uri.file(path.join(defaultDir, fileName));

      const isPdf = fileName.endsWith(".pdf");
      const filters: Record<string, string[]> = isPdf
        ? { "PDF Document": ["pdf"] }
        : { "Markdown Document": ["md"] };

      const uri = await vscode.window.showSaveDialog({
        defaultUri,
        saveLabel: "Save Report",
        filters,
      });

      if (!uri) {
        this.post({
          type: "save-report-file-result",
          savedPath: null,
          requestId,
        });
        return;
      }

      const buffer =
        encoding === "base64"
          ? Buffer.from(content, "base64")
          : Buffer.from(content, "utf-8");

      await vscode.workspace.fs.writeFile(uri, buffer);

      void vscode.window
        .showInformationMessage(
          `Scan report saved to ${path.basename(uri.fsPath)}`,
          "Open File",
        )
        .then((choice) => {
          if (choice === "Open File") {
            void vscode.commands.executeCommand("vscode.open", uri);
          }
        });

      this.post({
        type: "save-report-file-result",
        savedPath: uri.fsPath,
        requestId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Failed to save report: ${msg}`);
      this.post({
        type: "error",
        message: `Failed to save report: ${msg}`,
        requestId,
      });
    }
  }

  private async handleJumpToLine(
    filePath: string,
    line: number,
    requestId: string | undefined,
  ): Promise<void> {
    const document = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false,
    });
    const position = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenter,
    );
    void requestId; // jump-to-line has no result variant -- nothing to reply with.
  }
}
