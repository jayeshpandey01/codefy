import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createRoot } from "react-dom/client";
import type {
  AllScanProfile,
  AuditEventRead,
  AuthSession,
  BridgeMessage,
  ChatGraphViewMode,
  Finding,
  GeneratedReport,
  GraphNode,
  SastProfile,
  ScanProfile,
  ScanRead,
  ScanResultRead,
  ScanSessionEntry,
  ScanSessionWithFindings,
  ScanCoverage,
  SettingsModalTabId,
  StructuredErrorPayload,
  TargetRead,
  UserAccount,
  UserSettings,
  WorkspaceGraph,
  WorkspaceGraphNode,
} from "@whoami/types";
import { deduplicateFindings, toStructuredError } from "@whoami/types";
import {
  ActionableErrorBanner,
  BridgeProvider,
  UpdateBanner,
  ChatPanel,
  FloatingDetailCard,
  GraphContainer,
  IssueTreeSidebar,
  QuickSearchModal,
  ReportView,
  SettingsHistoryModal,
  ThemeProvider,
  useTheme,
  SplashScreen,
  UnifiedScanHeader,
  WelcomeScreen,
  type ChatTurn,
  type ChatSession,
  type ScanMode,
  convertScanResultToFindings,
  filterWorkspaceGraphTestFiles,
  UnifiedInterconnectedGraphView,
  BlastRadiusGraphView,
  ControlFlowGraphView,
  DependencySupplyChainGraphView,
  RemoteAttackSurfaceGraphView,
  ResizableSplitter,
  ScrollableTabsBar,
  DiamondIcon,
  FileCodeIcon,
  RadioIcon,
  RemoteScanIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XIcon,
} from "@whoami/ui";
import "@whoami/ui/styles.css";
import {
  HostedLlmClient,
  DEFAULT_AI_GATEWAY_URL,
  runChatQuery,
  parseSlashCommand,
  executeSlashCommand,
  executeUnknownSlashCommand,
  generateMarkdownReport,
} from "@whoami/core/query";
import { VsCodeBridgeClient } from "./bridge/vscodeBridgeClient.js";
import {
  clearAllScanHistory,
  clearAuthSession,
  deleteScanSession,
  getAccount,
  getAuthSession,
  getPreference,
  getScanSessionWithFindings,
  getSettings,
  initPersistence,
  listScanSessions,
  saveAccount,
  saveAuthSession,
  initAuthSessionStore,
  saveScanSession,
  saveSettings,
  setPreference,
  upsertWorkspace,
} from "../db/index.js";

const bridge = new VsCodeBridgeClient();
initPersistence(bridge);
initAuthSessionStore(bridge);

type ScanStatus = "idle" | "scanning" | "error";
type MainTabId =
  | "graph"
  | "unified"
  | "blast_radius"
  | "control_flow"
  | "supply_chain"
  | "remote";
type GraphViewMode = "all" | "selected";

interface TabDefinition {
  id: MainTabId;
  label: string;
  icon: React.ReactNode;
}

const ALL_TABS: Record<MainTabId, TabDefinition> = {
  graph: {
    id: "graph",
    label: "DATA FLOW DAG",
    icon: <ShieldCheckIcon size={13} className="text-[#75BEFF] shrink-0" />,
  },
  unified: {
    id: "unified",
    label: "UNIFIED ARCHITECTURE + TAINT",
    icon: <RadioIcon size={13} className="text-[#4EC9B0] shrink-0" />,
  },
  blast_radius: {
    id: "blast_radius",
    label: "THREAT MODEL & BLAST RADIUS",
    icon: <ShieldAlertIcon size={13} className="text-[#F14C4C] shrink-0" />,
  },
  control_flow: {
    id: "control_flow",
    label: "CONTROL FLOW & DECISION GATES",
    icon: <DiamondIcon size={13} className="text-[#FFD700] shrink-0" />,
  },
  supply_chain: {
    id: "supply_chain",
    label: "SUPPLY CHAIN & DEPENDENCIES",
    icon: <FileCodeIcon size={13} className="text-[#4EC9B0] shrink-0" />,
  },
  remote: {
    id: "remote",
    label: "REMOTE ATTACK SURFACE",
    icon: <RemoteScanIcon size={13} className="text-[#89D185] shrink-0" />,
  },
};

function App(): ReactElement {
  const [openTabs, setOpenTabs] = useState<MainTabId[]>([
    "graph",
    "unified",
    "control_flow",
    "supply_chain",
    "blast_radius",
  ]);
  const [activeTab, setActiveTab] = useState<MainTabId | null>("graph");
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>("all");
  const [layoutDirection, setLayoutDirection] = useState<"DOWN" | "RIGHT">("DOWN");
  const [scanMode, setScanMode] = useState<ScanMode>("local-offline");
  const [analysisPipelineMode, setAnalysisPipelineMode] = useState<"bugs" | "full">("bugs");

  const [findings, setFindings] = useState<readonly Finding[]>([]);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [isChatStreaming, setIsChatStreaming] = useState<boolean>(false);
  const hostedLlmClient = useMemo(
    () => new HostedLlmClient({ baseUrl: DEFAULT_AI_GATEWAY_URL }),
    [],
  );
  const [selectedFinding, setSelectedFinding] = useState<Finding | undefined>(undefined);

  const [showFloatingDetail, setShowFloatingDetail] = useState<boolean>(false);
  const [workspaceGraph, setWorkspaceGraph] = useState<WorkspaceGraph | undefined>(undefined);
  // Test suites often dominate a codebase's file count relative to app code
  // -- default to hiding them in the "Whole Code" architecture graphs.
  const [hideTestFiles, setHideTestFiles] = useState<boolean>(true);
  const architectureGraph = useMemo(
    () => filterWorkspaceGraphTestFiles(workspaceGraph, hideTestFiles),
    [workspaceGraph, hideTestFiles],
  );
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<{
    scanned: number;
    total: number;
  } | null>(null);
  const [scanCoverage, setScanCoverage] = useState<ScanCoverage | null>(null);
  const [isOrchestratorScanning, setIsOrchestratorScanning] = useState<boolean>(false);
  const [orchestratorProgress, setOrchestratorProgress] = useState<{
    currentTask: string;
    completed: number;
    total: number;
  } | null>(null);
  const [errorPayload, setErrorPayload] = useState<StructuredErrorPayload | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const selectedFolderRef = useRef(selectedFolder);
  selectedFolderRef.current = selectedFolder;
  const scanModeRef = useRef(scanMode);
  scanModeRef.current = scanMode;
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [focusTargetFilePath, setFocusTargetFilePath] = useState<string | null>(null);

  // Settings & Scan History Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<SettingsModalTabId>("account");

  // Current-scan report preview state (top navbar Download dropdown)
  const [isCurrentReportOpen, setIsCurrentReportOpen] = useState<boolean>(false);
  const [currentReport, setCurrentReport] = useState<GeneratedReport | null>(null);
  const [currentReportFormat, setCurrentReportFormat] = useState<"md" | "pdf" | undefined>(undefined);
  const [userAccount, setUserAccount] = useState<UserAccount>({
    name: "Local Developer",
    email: "developer@local.workspace",
    tier: "community",
  });
  const [userSettings, setUserSettings] = useState<UserSettings | undefined>(undefined);
  const [scanSessions, setScanSessions] = useState<ScanSessionEntry[]>([]);
  const { theme: activeTheme, setTheme: setActiveTheme } = useTheme();

  // Reapply the persisted theme choice once settings load from the
  // extension-host-backed DB -- ThemeContext's own localStorage persistence
  // isn't reliable across VS Code webview panel teardown/recreation, so
  // UserSettings.theme (synced via the bridge) is the durable source; this
  // just re-applies it to the DOM/context on top of whatever ThemeContext
  // already restored from localStorage for this session.
  useEffect(() => {
    if (userSettings?.theme && userSettings.theme !== activeTheme) {
      setActiveTheme(userSettings.theme);
    }
  }, [userSettings?.theme]);

  // Auth: the whole webview is gated behind a real signed-in session against
  // the hosted AI Gateway's own account system (see ../db/authRepo.ts +
  // @whoami/core's GatewayAuthClient) -- authLoading===true is "still
  // checking for a saved session", not yet "show the welcome screen".
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  // Keeps the animated splash on screen until its own count-up/reveal
  // sequence finishes, so the webview never jumps straight from a blank
  // frame into the login form even when the session check below resolves
  // almost instantly -- SplashScreen owns the timing via onFinished.
  const [showSplash, setShowSplash] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    async function loadAuth() {
      try {
        const session = await getAuthSession();
        if (mounted && session && session.expiresAt > Date.now()) {
          setAuthSession(session);
        }
      } catch (err) {
        console.warn("[WhoAmI] Failed to restore auth session:", err);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }
    void loadAuth();
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize persisted DB state on mount (extension-host-backed via
  // ../db/index.js -- see apps/vscode-extension/src/db/database.ts's module
  // doc for why this is a separate implementation from the desktop app's
  // IndexedDB one, behind the exact same function signatures).
  useEffect(() => {
    let mounted = true;
    async function loadDbState() {
      try {
        const [acc, sets, sessions, lastFolder] = await Promise.all([
          getAccount(),
          getSettings(),
          listScanSessions(100),
          getPreference<string>("last_folder", ""),
        ]);
        if (!mounted) return;
        setUserAccount(acc);
        setUserSettings(sets);
        setScanSessions(sessions);
        if (sets.defaultLayoutDirection) {
          setLayoutDirection(sets.defaultLayoutDirection);
        }
        if (sets.analysisPipelineMode) {
          setAnalysisPipelineMode(sets.analysisPipelineMode);
        }
        if (lastFolder && !selectedFolder) {
          setSelectedFolder(lastFolder);
        }
      } catch (err) {
        console.warn("[WhoAmI] Failed to initialize DB state:", err);
      }
    }
    void loadDbState();
    return () => {
      mounted = false;
    };
  }, []);

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K / / to open Quick Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const isModifier = isMac ? e.metaKey : e.ctrlKey;

      if (isModifier && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (isModifier && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsLeftSidebarOpen((prev) => !prev);
      } else if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const offProgress = bridge.on("scan-workspace-progress", (message) => {
      setProgress({ scanned: message.scanned, total: message.total });
    });

    const offResult = bridge.on("scan-workspace-result", (message) => {
      const nextFindings = deduplicateFindings(message.findings);
      setFindings(nextFindings);
      if (nextFindings.length > 0) {
        setSelectedFinding(nextFindings[0]);
        setShowFloatingDetail(true);
      }
      setStatus("idle");
      setProgress(null);
      setScanCoverage(message.coverage ?? null);

      // Record completed scan session in local database
      const sessionId = `scan-vscode-${Date.now()}`;
      void saveScanSession(
        {
          id: sessionId,
          workspacePath: selectedFolderRef.current || "Local Workspace",
          startedAt: Date.now() - 1000,
          finishedAt: Date.now(),
          mode: scanModeRef.current,
          findingsCount: nextFindings.length,
        },
        nextFindings,
      ).then(async () => {
        const updated = await listScanSessions(100);
        setScanSessions(updated);
      });
      if (selectedFolderRef.current) {
        void upsertWorkspace(selectedFolderRef.current);
        void setPreference("last_folder", selectedFolderRef.current);
      }

      // Refresh workspace graph on scan completion
      bridge.send({
        type: "get-workspace-graph-request",
        requestId: `tree-scan-${Date.now()}`,
      });
    });

    const offGraph = bridge.on("get-workspace-graph-result", (message) => {
      setWorkspaceGraph(message.graph);
    });

    const offError = bridge.on("error", (message) => {
      setErrorPayload(message);
      setStatus("error");
      setProgress(null);
    });

    return () => {
      offProgress();
      offResult();
      offGraph();
      offError();
    };
  }, []);


  const openTab = useCallback((tabId: MainTabId) => {
    setOpenTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
    setActiveTab(tabId);
  }, []);

  const handleRestoreSession = useCallback(
    async (sessionId: string) => {
      try {
        const sessionData = await getScanSessionWithFindings(sessionId);
        if (sessionData) {
          const unique = deduplicateFindings(sessionData.findings);
          setFindings(unique);
          if (unique.length > 0) {
            setSelectedFinding(unique[0]);
            setShowFloatingDetail(true);
          } else {
            setSelectedFinding(undefined);
            setShowFloatingDetail(false);
          }

          if (sessionData.workspacePath) {
            setSelectedFolder(sessionData.workspacePath);
            void setPreference("last_folder", sessionData.workspacePath);
            void upsertWorkspace(sessionData.workspacePath);
          }
          openTab("graph");
        }
      } catch (err) {
        console.warn(`[WhoAmI] Failed to restore session ${sessionId}:`, err);
      }
    },
    [openTab],
  );

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      await deleteScanSession(sessionId);
      const updated = await listScanSessions(100);
      setScanSessions(updated);
    } catch (err) {
      console.warn(`[WhoAmI] Failed to delete session ${sessionId}:`, err);
    }
  }, []);

  const handleGenerateReport = useCallback(async (sessionId: string) => {
    const sessionData = await getScanSessionWithFindings(sessionId);
    if (!sessionData) {
      throw new Error(`No stored session found for id "${sessionId}".`);
    }
    return generateMarkdownReport(sessionData, [], {
      includeSecrets: true,
      includeTaintPaths: true,
      includeFixDiff: true,
    });
  }, []);

  const handleDownloadReport = useCallback(
    (format: "md" | "pdf") => {
      const session: ScanSessionWithFindings = {
        id: `scan-preview-${Date.now()}`,
        workspacePath: selectedFolder || "Local Workspace",
        startedAt: Date.now(),
        finishedAt: Date.now(),
        mode: scanMode,
        findingsCount: findings.length,
        findings,
      };
      const report = generateMarkdownReport(session, [], {
        includeSecrets: true,
        includeTaintPaths: true,
        includeFixDiff: true,
      });
      setCurrentReportFormat(format);
      setCurrentReport(report);
      setIsCurrentReportOpen(true);
    },
    [findings, selectedFolder, scanMode],
  );

  const handleSaveReportFile = useCallback(
    async (
      fileName: string,
      content: string,
      encoding: "utf-8" | "base64",
      mimeType: string,
    ): Promise<boolean> => {
      try {
        const res = await bridge.request<
          Extract<BridgeMessage, { type: "save-report-file-request" }>,
          Extract<BridgeMessage, { type: "save-report-file-result" }>
        >({
          type: "save-report-file-request",
          fileName,
          content,
          encoding,
          mimeType,
          requestId: `save-report-${Date.now()}`,
        });
        return Boolean(res.savedPath);
      } catch (err) {
        console.warn("[WhoAmI] Failed to save report file via bridge:", err);
        return false;
      }
    },
    [],
  );

  const handleClearAllHistory = useCallback(async () => {
    try {
      await clearAllScanHistory();
      setScanSessions([]);
    } catch (err) {
      console.warn("[WhoAmI] Failed to clear scan history:", err);
    }
  }, []);

  const handleSaveAccount = useCallback(async (newAccount: UserAccount) => {
    const saved = await saveAccount(newAccount);
    setUserAccount(saved);
  }, []);

  const handleAuthSuccess = useCallback(
    async (session: AuthSession) => {
      await saveAuthSession(session);
      setAuthSession(session);
      await handleSaveAccount({ name: session.name, email: session.email, tier: session.tier });
    },
    [handleSaveAccount],
  );

  // Auth calls go over the bridge to the extension host (real Node.js) --
  // the webview's own CSP is `connect-src 'none'` by design (see
  // getWebviewHtml.ts), so it can never fetch the AI Gateway directly.
  const handleWelcomeLogin = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await bridge.request<
          Extract<BridgeMessage, { type: "auth-login-request" }>,
          Extract<BridgeMessage, { type: "auth-login-result" }>
        >({ type: "auth-login-request", email, password });
        await handleAuthSuccess(res.session);
        return { ok: true as const };
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : "Login failed." };
      }
    },
    [handleAuthSuccess],
  );

  const handleWelcomeRegister = useCallback(
    async (name: string, email: string, password: string) => {
      try {
        const res = await bridge.request<
          Extract<BridgeMessage, { type: "auth-register-request" }>,
          Extract<BridgeMessage, { type: "auth-register-result" }>
        >({ type: "auth-register-request", name, email, password });
        if (res.status === "authenticated" && res.session) {
          await handleAuthSuccess(res.session);
          return { ok: true as const, status: "authenticated" as const };
        }
        return { ok: true as const, status: "pending_verification" as const, email: res.email };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Registration failed.",
        };
      }
    },
    [handleAuthSuccess],
  );

  const handleWelcomeVerifyCode = useCallback(
    async (email: string, code: string) => {
      try {
        const res = await bridge.request<
          Extract<BridgeMessage, { type: "auth-verify-email-request" }>,
          Extract<BridgeMessage, { type: "auth-verify-email-result" }>
        >({ type: "auth-verify-email-request", email, code });
        await handleAuthSuccess(res.session);
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Verification failed.",
        };
      }
    },
    [handleAuthSuccess],
  );

  const handleWelcomeResendCode = useCallback(async (email: string) => {
    await bridge.request<
      Extract<BridgeMessage, { type: "auth-resend-code-request" }>,
      Extract<BridgeMessage, { type: "auth-resend-code-result" }>
    >({ type: "auth-resend-code-request", email });
  }, []);

  const handleContinueOffline = useCallback(() => {
    // Create a local-only session so the user can run deterministic scans
    // without authenticating against the remote AI Gateway.
    const session: AuthSession = {
      accessToken: "offline-local-session",
      tokenType: "Bearer",
      userId: "local-developer",
      name: "Local Developer",
      email: "developer@local.workspace",
      tier: "community",
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
    void handleAuthSuccess(session);
    setAuthLoading(false);
  }, [handleAuthSuccess]);

  const handleForgotPassword = useCallback(
    async (email: string) => {
      try {
        await bridge.request<
          Extract<BridgeMessage, { type: "auth-forgot-password-request" }>,
          Extract<BridgeMessage, { type: "auth-forgot-password-result" }>
        >({ type: "auth-forgot-password-request", email });
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Failed to send reset code.",
        };
      }
    },
    [],
  );

  const handleVerifyResetOtp = useCallback(
    async (email: string, code: string) => {
      await bridge.request<
        Extract<BridgeMessage, { type: "auth-verify-reset-otp-request" }>,
        Extract<BridgeMessage, { type: "auth-verify-reset-otp-result" }>
      >({ type: "auth-verify-reset-otp-request", email, code });
    },
    [],
  );

  const handleResetPassword = useCallback(
    async (req: { email: string; code: string; newPassword: string }) => {
      try {
        await bridge.request<
          Extract<BridgeMessage, { type: "auth-reset-password-request" }>,
          Extract<BridgeMessage, { type: "auth-reset-password-result" }>
        >({
          type: "auth-reset-password-request",
          email: req.email,
          code: req.code,
          newPassword: req.newPassword,
        });
        return { ok: true as const };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Failed to reset password.",
        };
      }
    },
    [],
  );

  const handleVerifyEmail = useCallback(
    async (email: string, code: string) => {
      const res = await bridge.request<
        Extract<BridgeMessage, { type: "auth-verify-email-request" }>,
        Extract<BridgeMessage, { type: "auth-verify-email-result" }>
      >({ type: "auth-verify-email-request", email, code });
      await handleAuthSuccess(res.session);
    },
    [handleAuthSuccess],
  );

  const handleResendEmailCode = useCallback(async (email: string) => {
    await bridge.request<
      Extract<BridgeMessage, { type: "auth-resend-code-request" }>,
      Extract<BridgeMessage, { type: "auth-resend-code-result" }>
    >({ type: "auth-resend-code-request", email });
  }, []);

  const handleListApiKeys = useCallback(async () => {
    if (!authSession?.accessToken) return [];
    const res = await bridge.request<
      Extract<BridgeMessage, { type: "auth-list-api-keys-request" }>,
      Extract<BridgeMessage, { type: "auth-list-api-keys-result" }>
    >({ type: "auth-list-api-keys-request", token: authSession.accessToken });
    return res.keys;
  }, [authSession?.accessToken]);

  const handleCreateApiKey = useCallback(
    async (name: string, expiresDays?: number) => {
      if (!authSession?.accessToken) return null;
      const res = await bridge.request<
        Extract<BridgeMessage, { type: "auth-create-api-key-request" }>,
        Extract<BridgeMessage, { type: "auth-create-api-key-result" }>
      >({
        type: "auth-create-api-key-request",
        token: authSession.accessToken,
        name,
        expiresDays,
      });
      return res.key;
    },
    [authSession?.accessToken],
  );

  const handleRevokeApiKey = useCallback(
    async (keyId: string) => {
      if (!authSession?.accessToken) return;
      await bridge.request<
        Extract<BridgeMessage, { type: "auth-revoke-api-key-request" }>,
        Extract<BridgeMessage, { type: "auth-revoke-api-key-result" }>
      >({
        type: "auth-revoke-api-key-request",
        token: authSession.accessToken,
        keyId,
      });
    },
    [authSession?.accessToken],
  );

  const handleLogout = useCallback(async () => {
    await clearAuthSession();
    setAuthSession(null);
    setIsSettingsOpen(false);
  }, []);

  const handleSaveSettings = useCallback(async (newSettings: UserSettings) => {
    const saved = await saveSettings(newSettings);
    setUserSettings(saved);
    if (saved.defaultLayoutDirection) {
      setLayoutDirection(saved.defaultLayoutDirection);
    }
    if (saved.analysisPipelineMode) {
      setAnalysisPipelineMode(saved.analysisPipelineMode);
    }
  }, []);

  const closeTab = useCallback(
    (tabId: MainTabId, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenTabs((prev) => {
        const next = prev.filter((id) => id !== tabId);
        if (activeTab === tabId) {
          const closedIndex = prev.indexOf(tabId);
          const fallback = next[closedIndex] || next[closedIndex - 1] || null;
          setActiveTab(fallback);
        }
        return next;
      });
    },
    [activeTab],
  );

  const handleScanWorkspace = useCallback(
    (folderPath?: string) => {
      const targetPath = folderPath ?? selectedFolder;
      setStatus("scanning");
      setErrorPayload(null);
      setProgress(null);
      setScanCoverage(null);
      if (targetPath) {
        setSelectedFolder(targetPath);
      }
      bridge.send({
        type: "scan-workspace-request",
        folderPath: targetPath || undefined,
        rules: userSettings?.rules,
        customExcludedDirs: userSettings?.customExcludedDirs,
        maxScannableFiles: userSettings?.maxScannableFiles,
        requestId: `vscode-scan-${Date.now()}`,
      });
    },
    [selectedFolder, userSettings?.rules],
  );

  const handleBrowseFolder = useCallback(async (): Promise<string | null> => {
    try {
      const res = await bridge.request<
        Extract<BridgeMessage, { type: "pick-folder-request" }>,
        Extract<BridgeMessage, { type: "pick-folder-result" }>
      >({
        type: "pick-folder-request",
        defaultPath: selectedFolder || undefined,
        requestId: `pick-folder-${Date.now()}`,
      });
      if (res.folderPath) {
        setSelectedFolder(res.folderPath);
        handleScanWorkspace(res.folderPath);
      }
      return res.folderPath;
    } catch (err) {
      console.warn("[WhoAmI] Failed to browse folder via bridge:", err);
      return null;
    }
  }, [selectedFolder, handleScanWorkspace]);

  const handleSelectFinding = useCallback(
    (finding: Finding) => {
      setSelectedFinding(finding);
      setShowFloatingDetail(true);
      setGraphViewMode("selected");
      if (finding.trace?.steps?.[0]?.filePath) {
        setFocusTargetFilePath(finding.trace.steps[0].filePath);
      }
      openTab("graph");
    },
    [openTab],
  );

  const handleSelectFileFromSearch = useCallback(
    (filePath: string) => {
      setFocusTargetFilePath(filePath);
      const matched = findings.find((f) =>
        f.trace?.steps?.some((s) => s.filePath === filePath),
      );
      if (matched) {
        setSelectedFinding(matched);
        setShowFloatingDetail(true);
        setGraphViewMode("selected");
        openTab("graph");
      } else {
        openTab("unified");
      }
    },
    [findings, openTab],
  );

  const handleChatSubmit = useCallback(
    async (query: string) => {
      const turnId = `chat-${Date.now()}-${chatTurns.length}`;

      // Slash commands ("/help", "/vuln <url>", ...) are recognized and
      // answered deterministically here -- see
      // packages/core/src/query/slash-commands.ts's docstring for the bug
      // this fixes (both "/help" and "/vuln nasa.gov" used to land on
      // EXPLAIN_FINDING via the NLU classifier and produce a confusing
      // "Which finding?" reply instead of being recognized as commands).
      const parsedCommand = parseSlashCommand(query);
      if (parsedCommand) {
        const result =
          "unknownCommand" in parsedCommand
            ? executeUnknownSlashCommand(parsedCommand)
            : executeSlashCommand(parsedCommand);
        setChatTurns((prev) => [...prev, { id: turnId, query, result }]);
        return;
      }

      setIsChatStreaming(true);

      setChatTurns((prev) => [
        ...prev,
        {
          id: turnId,
          query,
          result: {
            capability: "SUPPORTED",
            findings: [],
            explanation: "",
          },
        },
      ]);

      try {
        let accumulatedText = "";

        const finalResult = await hostedLlmClient.streamRagChat(
          query,
          findings,
          {
            workspaceGraph,
            selectedFindingId: selectedFinding?.id,
          },
          (chunk) => {
            if (chunk.delta) {
              accumulatedText += chunk.delta;
              setChatTurns((prev) =>
                prev.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        result: {
                          ...t.result,
                          explanation: accumulatedText,
                        },
                      }
                    : t,
                ),
              );
            }
          },
        );

        setChatTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  result: finalResult,
                }
              : t,
          ),
        );
      } finally {
        setIsChatStreaming(false);
      }
    },
    [findings, workspaceGraph, selectedFinding, hostedLlmClient, chatTurns.length],
  );


  const handleChatOpenInGraphView = useCallback(
    (finding: Finding, mode: ChatGraphViewMode) => {
      setSelectedFinding(finding);
      setShowFloatingDetail(true);
      setGraphViewMode("selected");
      openTab(mode);
    },
    [openTab],
  );

  const handleJumpToLine = useCallback((filePath: string, line: number) => {
    bridge.send({
      type: "jump-to-line",
      filePath,
      line,
    });
  }, []);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      // Do not auto-open file on node click; focus connected paths in graph instead.
      // File opening is cleanly available via the "Open File" button on hover.
      const matched = findings.find((f) =>
        f.trace.steps.some(
          (s) => s.filePath === node.filePath && s.line === node.line,
        ),
      );
      if (matched) {
        setSelectedFinding(matched);
        setShowFloatingDetail(true);
      }
    },
    [findings],
  );

  const handleTreeNodeClick = useCallback(
    (node: WorkspaceGraphNode) => {
      if (node.filePath) {
        handleJumpToLine(node.filePath, node.line ?? 1);
      }
    },
    [handleJumpToLine],
  );

  // Orchestrator Bridge Helpers
  const handleRegisterTarget = useCallback(
    async (target: {
      value: string;
      owner: string;
      targetType?: "network" | "source_code";
    }): Promise<TargetRead> => {
      const res = await bridge.request<
        Extract<BridgeMessage, { type: "register-target-request" }>,
        Extract<BridgeMessage, { type: "register-target-result" }>
      >({
        type: "register-target-request",
        target: {
          value: target.value,
          owner_reference: target.owner,
          authorization_reference: "USER_ATTESTED_ON_SCAN_START",
          authorization_confirmed: true,
          target_type: target.targetType,
        },
        requestId: `reg-${Date.now()}`,
      });
      return res.target;
    },
    [],
  );

  const handleSubmitScan = useCallback(
    async (
      targetId: string,
      profile: AllScanProfile,
      ruleTags?: string[],
    ): Promise<ScanRead> => {
      const isSast = profile.startsWith("sast-");
      if (isSast) {
        const res = await bridge.request<
          Extract<BridgeMessage, { type: "submit-sast-scan-request" }>,
          Extract<BridgeMessage, { type: "submit-sast-scan-result" }>
        >({
          type: "submit-sast-scan-request",
          scan: {
            target_id: targetId,
            profile: profile as SastProfile,
            rule_tags: ruleTags,
          },
          requestId: `sub-sast-${Date.now()}`,
        });
        return res.scan;
      }
      const res = await bridge.request<
        Extract<BridgeMessage, { type: "submit-remote-scan-request" }>,
        Extract<BridgeMessage, { type: "submit-remote-scan-result" }>
      >({
        type: "submit-remote-scan-request",
        scan: { target_id: targetId, profile: profile as ScanProfile },
        requestId: `sub-${Date.now()}`,
      });
      return res.scan;
    },
    [],
  );

  // Polls every scan of one run (all DAST or all SAST) in a single bridge
  // request; the host batches status checks and backs off (see
  // ScanOrchestratorClient.pollScansUntilComplete). Progress arrives as
  // poll-remote-scans-progress events keyed by pollId, not requestId, since a
  // message carrying the requestId would resolve the pending request early.
  const handlePollScans = useCallback(
    async (
      scanIds: string[],
      kind: "dast" | "sast",
      targetId: string,
      onProgress: (scans: readonly ScanRead[]) => void,
    ): Promise<readonly { scan: ScanRead; result?: ScanResultRead }[]> => {
      if (scanIds.length === 0) return [];
      const pollId = `poll-${kind}-${Date.now()}`;
      const off = bridge.on("poll-remote-scans-progress", (message) => {
        if (message.pollId === pollId) onProgress(message.scans);
      });
      try {
        const res = await bridge.request<
          Extract<BridgeMessage, { type: "poll-remote-scans-request" }>,
          Extract<BridgeMessage, { type: "poll-remote-scans-result" }>
        >(
          {
            type: "poll-remote-scans-request",
            scanIds,
            kind,
            targetId,
            pollId,
            requestId: `${pollId}-req`,
          },
          // Just above the client's own 40-minute poll ceiling
          // (DEFAULT_POLL_MAX_WAIT_MS in packages/core/src/orchestrator/client.ts),
          // so the inner poll always gives up first with a descriptive error.
          41 * 60 * 1000,
        );
        return res.results;
      } finally {
        off();
      }
    },
    [],
  );

  // Multi-task Orchestrator Execution
  const handleRunOrchestratorScan = useCallback(
    async ({
      target,
      profiles,
    }: {
      target: string;
      profiles: (AllScanProfile | "secret-scan")[];
    }) => {
      setIsOrchestratorScanning(true);
      setErrorPayload(null);
      setOrchestratorProgress({
        currentTask: "Registering Target…",
        completed: 0,
        total: profiles.length,
      });

      try {
        const isSast = profiles.some((p) => p.startsWith("sast-"));
        const targetRead = await handleRegisterTarget({
          value: target,
          owner: authSession?.name || "Account User",
          targetType: isSast ? "source_code" : "network",
        });

        // Submit every profile up front, then poll the whole run together, so
        // the controller can run them concurrently (bounded server-side by its
        // worker count and per-target cap) instead of one after another. Each
        // profile still runs exactly the same scan, so findings are unchanged.
        const submitted: {
          profile: AllScanProfile;
          scanId: string;
          isSast: boolean;
        }[] = [];
        for (const profile of profiles) {
          if (profile === "secret-scan") continue;
          setOrchestratorProgress({
            currentTask: `Queueing ${profile}…`,
            completed: 0,
            total: profiles.length,
          });
          const scan = await handleSubmitScan(targetRead.id, profile);
          submitted.push({ profile, scanId: scan.id, isSast: profile.startsWith("sast-") });
        }

        const statusById = new Map<string, ScanRead>();
        const reportProgress = (scans: readonly ScanRead[]) => {
          for (const scan of scans) statusById.set(scan.id, scan);
          const done = [...statusById.values()].filter((scan) =>
            ["completed", "failed", "cancelled"].includes(scan.status),
          ).length;
          const running = submitted
            .filter(({ scanId }) => statusById.get(scanId)?.status === "running")
            .map(({ profile }) => profile);
          setOrchestratorProgress({
            currentTask:
              running.length > 0 ? `Running ${running.join(", ")}…` : "Waiting for scanner…",
            completed: done,
            total: profiles.length,
          });
        };

        const idsOf = (sast: boolean) =>
          submitted.filter((s) => s.isSast === sast).map((s) => s.scanId);
        const [dastResults, sastResults] = await Promise.all([
          handlePollScans(idsOf(false), "dast", targetRead.id, reportProgress),
          handlePollScans(idsOf(true), "sast", targetRead.id, reportProgress),
        ]);
        const resultById = new Map(
          [...dastResults, ...sastResults].map((polled) => [polled.scan.id, polled]),
        );

        const allNewFindings: Finding[] = [];
        for (const { profile, scanId, isSast } of submitted) {
          const pollRes = resultById.get(scanId);
          // A profile completing with zero findings is a normal, good
          // outcome (e.g. "recon" against a clean target) -- it must not be
          // padded with an invented "confirmed" finding. Doing so fabricated
          // a fake CWE-699/ssrf finding with a made-up attack path on every
          // clean scan, which is exactly what CLAUDE.md's "never generate
          // unverified findings" principle rules out.
          if (pollRes?.result) {
            const imported = convertScanResultToFindings(pollRes.result, target, {
              isSast,
              profile,
            });
            allNewFindings.push(...imported);
          }
        }

        setOrchestratorProgress({
          currentTask: "Orchestration Complete",
          completed: profiles.length,
          total: profiles.length,
        });

        if (allNewFindings.length > 0) {
          setFindings((prev) => deduplicateFindings([...prev, ...allNewFindings]));
          setSelectedFinding(allNewFindings[0]);
          setShowFloatingDetail(true);
          openTab("graph");
        }
      } catch (err) {
        setErrorPayload(toStructuredError(err, "orchestrator"));
      } finally {
        setIsOrchestratorScanning(false);
        setTimeout(() => setOrchestratorProgress(null), 4000);
      }
    },
    [authSession?.name, handleRegisterTarget, handleSubmitScan, handlePollScans, openTab],
  );

  const localCount = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.scope !== "orchestrator" &&
          !f.id.startsWith("remote-") &&
          !f.ruleId.startsWith("remote-"),
      ).length,
    [findings],
  );

  const orchestratorCount = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.scope === "orchestrator" ||
          f.id.startsWith("remote-") ||
          f.ruleId.startsWith("remote-"),
      ).length,
    [findings],
  );

  const handleRunCloudSastScan = useCallback(
    (params: {
      folderPath: string;
      profiles: (AllScanProfile | "secret-scan")[];
      ruleTags?: string[];
    }) => {
      handleRunOrchestratorScan({
        target: params.folderPath,
        profiles: params.profiles,
      });
    },
    [handleRunOrchestratorScan],
  );

  const handleScanModeChange = (newMode: ScanMode) => {
    setScanMode(newMode);
    if (newMode === "orchestrator" || newMode === "target-dast") {
      if (activeTab !== "remote" && activeTab !== "blast_radius") {
        setActiveTab("remote");
        if (!openTabs.includes("remote")) {
          setOpenTabs((prev) => [...prev, "remote"]);
        }
      }
    } else {
      if (activeTab === "remote") {
        setActiveTab("graph");
        if (!openTabs.includes("graph")) {
          setOpenTabs((prev) => [...prev, "graph"]);
        }
      }
    }
  };

  const [sidebarWidth, setSidebarWidth] = useState<number>(288);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [rightSectionWidth, setRightSectionWidth] = useState<number>(280);
  const [isRightSectionOpen, setIsRightSectionOpen] = useState<boolean>(false);

  const handleAnalysisPipelineModeChange = (mode: "bugs" | "full") => {
    setAnalysisPipelineMode(mode);
    if (mode === "bugs") {
      openTab("graph");
    }
  };

  const visibleTabs = openTabs.filter((tabId) => {
    if (scanMode === "orchestrator") {
      return tabId === "remote" || tabId === "blast_radius";
    }
    return tabId !== "remote";
  });

  if (authLoading || showSplash) {
    return <SplashScreen onFinished={() => setShowSplash(false)} />;
  }

  if (!authSession) {
    return (
      <WelcomeScreen
        onLogin={handleWelcomeLogin}
        onRegister={handleWelcomeRegister}
        onVerifyCode={handleWelcomeVerifyCode}
        onResendCode={handleWelcomeResendCode}
        onForgotPassword={handleForgotPassword}
        onResetPassword={handleResetPassword}
        onContinueOffline={handleContinueOffline}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#141414] text-[#D4D4D4] font-sans select-none p-1 gap-0">
      {/* Release pipeline update banner -- floats above everything, mounted
          once at the shell root so it never competes for layout space with
          the panes below. See docs/RELEASE-PIPELINE.md. */}
      <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-xl">
          <UpdateBanner />
        </div>
      </div>

      {/* 1. Left Issues Explorer Sidebar with resizable width & Image 1 card styling */}
      {isLeftSidebarOpen && (
        <>
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="flex flex-col h-full shrink-0 rounded-lg border border-[#303031] bg-[#252526] overflow-hidden shadow-sm"
          >
            <IssueTreeSidebar
              findings={findings}
              selectedFindingId={selectedFinding?.id}
              onSelectFinding={handleSelectFinding}
              onRefreshScan={() => handleScanWorkspace(selectedFolder || undefined)}
              isRefreshing={status === "scanning"}
              activeScanMode={scanMode}
              onScanModeChange={handleScanModeChange}
              onTriggerOrchestratorScan={() => handleScanModeChange("orchestrator")}
              isLeftSidebarOpen={isLeftSidebarOpen}
              onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
              isRightSectionOpen={isRightSectionOpen}
              onToggleRightSection={() => setIsRightSectionOpen((prev) => !prev)}
              onOpenSettings={() => {
                setSettingsTab("account");
                setIsSettingsOpen(true);
              }}
              onOpenHistory={() => {
                setSettingsTab("history");
                setIsSettingsOpen(true);
              }}
            />
          </div>

          <ResizableSplitter
            onResize={(delta) =>
              setSidebarWidth((prev) => Math.max(180, Math.min(600, prev + delta)))
            }
            onReset={() => setSidebarWidth(288)}
            title="Resize Issues Explorer (double click to reset)"
          />
        </>
      )}

      {/* 2. Main Center/Right Body with Image 1 card styling */}
      <div className="flex min-w-0 flex-1 flex-col h-full rounded-lg border border-[#303031] bg-[#1E1E1E] overflow-hidden shadow-sm">
        {/* Top Dual-Mode Header (Normal Scan & Orchestrator Scan) */}
        <UnifiedScanHeader
          scanMode={scanMode}
          onScanModeChange={handleScanModeChange}
          currentFolderPath={selectedFolder}
          onFolderChange={setSelectedFolder}
          onBrowseFolder={handleBrowseFolder}
          onScanLocal={(folderPath) => handleScanWorkspace(folderPath)}
          isLocalScanning={status === "scanning"}
          localProgress={progress}
          onScanCloudSast={handleRunCloudSastScan}
          isCloudSastScanning={isOrchestratorScanning && scanMode === "cloud-sast"}
          cloudSastProgress={orchestratorProgress}
          onScanOrchestrator={handleRunOrchestratorScan}
          isOrchestratorScanning={isOrchestratorScanning && scanMode !== "cloud-sast"}
          orchestratorProgress={orchestratorProgress}
          layoutDirection={layoutDirection}
          onLayoutDirectionChange={setLayoutDirection}
          graphViewMode={graphViewMode}
          onGraphViewModeChange={setGraphViewMode}
          activeGraph={
            activeTab ||
            (scanMode === "orchestrator" || scanMode === "target-dast"
              ? "remote"
              : "graph")
          }
          onSelectGraph={(graphId) => openTab(graphId)}
          findingCount={findings.length}
          localCount={localCount}
          orchestratorCount={orchestratorCount}
          analysisPipelineMode={analysisPipelineMode}
          onAnalysisPipelineModeChange={handleAnalysisPipelineModeChange}
          isLeftSidebarOpen={isLeftSidebarOpen}
          onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
          isRightSectionOpen={isRightSectionOpen}
          onToggleRightSection={() => setIsRightSectionOpen((prev) => !prev)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onDownloadReport={handleDownloadReport}
          hideTestFiles={hideTestFiles}
          onToggleHideTestFiles={() => setHideTestFiles((prev) => !prev)}
        />

        {/* View Tabs Bar with VS Code overlay scrollbars, overflow shadows, and diagram icons */}
        <ScrollableTabsBar
          tabs={visibleTabs.map((tabId) => ({
            id: tabId,
            label: ALL_TABS[tabId]?.label || tabId,
            icon: ALL_TABS[tabId]?.icon,
          }))}
          activeTab={activeTab || ""}
          onSelectTab={(id) => setActiveTab(id as MainTabId)}
          onCloseTab={(id, e) => closeTab(id as MainTabId, e)}
        />

          {/* Error Banner */}
          {errorPayload && (
            <div className="p-3 border-b border-[#303031] bg-[#1E1E1E] shrink-0">
              <ActionableErrorBanner
                error={errorPayload}
                onDismiss={() => setErrorPayload(null)}
                onRetry={() => handleScanWorkspace()}
              />
            </div>
          )}
          {scanCoverage && (
            <div role="status" className="border-b border-vscode-border bg-vscode-card px-4 py-1 text-xs text-vscode-muted shrink-0">
              Offline scan coverage: {scanCoverage.filesScanned} file(s) analyzed out of {scanCoverage.filesDiscovered} file(s) visited;
              {` ${scanCoverage.filesFailed} failed, ${scanCoverage.filesSkippedLarge} too large, ${scanCoverage.filesSkippedUnsupported} unsupported, ${scanCoverage.directoriesSkipped} excluded folder(s), ${scanCoverage.directoriesUnreadable} unreadable folder(s)`}
              {scanCoverage.fileLimitReached ? `; file limit reached` : ""}.
            </div>
          )}

        {/* Central Canvas Area */}
        <main className="relative min-h-0 flex-1 w-full bg-[#1E1E1E] overflow-hidden">
          {openTabs.length === 0 || activeTab === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-xs text-[#858585]">
              <div>No views currently active.</div>
              <button
                type="button"
                onClick={() => openTab("graph")}
                className="rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] transition cursor-pointer"
              >
                Open Data Flow Graph
              </button>
            </div>
          ) : (
            <>
              {/* Graph Mode */}
              {activeTab === "graph" && (
                <>
                  {findings.length > 0 ? (
                    <GraphContainer
                      findings={
                        graphViewMode === "all"
                          ? findings
                          : selectedFinding
                            ? [selectedFinding]
                            : findings
                      }
                      trace={
                        graphViewMode === "selected" && selectedFinding
                          ? selectedFinding.trace
                          : undefined
                      }
                      onNodeClick={handleNodeClick}
                      onJumpToLine={handleJumpToLine}
                      direction={layoutDirection}
                      targetFilePath={focusTargetFilePath ?? undefined}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
                      {status === "scanning" || isOrchestratorScanning
                        ? "Scanning and tracing data flows…"
                        : "No vulnerabilities detected. Select a folder to start scanning."}
                    </div>
                  )}

                  {/* Floating Detail Suggestion Box */}
                  {showFloatingDetail && selectedFinding && (
                    <FloatingDetailCard
                      finding={selectedFinding}
                      onClose={() => setShowFloatingDetail(false)}
                      onJumpToLine={handleJumpToLine}
                      onApplyFix={async (f) => {
                        const res = await bridge.request<
                          Extract<BridgeMessage, { type: "apply-fix-request" }>,
                          Extract<BridgeMessage, { type: "apply-fix-result" }>
                        >({
                          type: "apply-fix-request",
                          findingId: f.id,
                        });
                        if (res.applied) {
                          setFindings((prev) => prev.filter((item) => item.id !== f.id));
                          setSelectedFinding((prev) => (prev?.id === f.id ? undefined : prev));
                          setShowFloatingDetail(false);
                        }
                        return res.applied;
                      }}
                      onRunPoc={async (f) => {
                        const res = await bridge.request<
                          Extract<BridgeMessage, { type: "run-poc-request" }>,
                          Extract<BridgeMessage, { type: "run-poc-result" }>
                        >({ type: "run-poc-request", findingId: f.id });
                        return res.verified;
                      }}
                      onGetFileContent={async (filePath) => {
                        const res = await bridge.request<
                          Extract<BridgeMessage, { type: "get-file-content-request" }>,
                          Extract<BridgeMessage, { type: "get-file-content-result" }>
                        >({ type: "get-file-content-request", filePath });
                        return res.content;
                      }}
                    />
                  )}
                </>
              )}

              {/* Unified Interconnected Architecture & Taint Mode */}
              {activeTab === "unified" && (
                <UnifiedInterconnectedGraphView
                  workspaceGraph={architectureGraph}
                  findings={findings}
                  onNodeClick={handleNodeClick}
                  onJumpToLine={handleJumpToLine}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                  targetFilePath={focusTargetFilePath ?? undefined}
                />
              )}

              {/* Threat Model & Blast Radius Mode */}
              {activeTab === "blast_radius" && (
                <BlastRadiusGraphView
                  findings={findings}
                  workspaceGraph={architectureGraph}
                  onNodeClick={handleNodeClick}
                  onJumpToLine={handleJumpToLine}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}

              {/* Control Flow & Sanitizer Bypass Mode */}
              {activeTab === "control_flow" && (
                <ControlFlowGraphView
                  finding={selectedFinding}
                  findings={findings}
                  onNodeClick={handleNodeClick}
                  onJumpToLine={handleJumpToLine}
                  direction={layoutDirection}
                />
              )}

              {/* Supply Chain & Dependencies Mode */}
              {activeTab === "supply_chain" && (
                <DependencySupplyChainGraphView
                  workspaceGraph={architectureGraph}
                  findings={findings}
                  onNodeClick={handleNodeClick}
                  onJumpToLine={handleJumpToLine}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}

              {/* Remote Attack Surface Mode */}
              {activeTab === "remote" && (
                <RemoteAttackSurfaceGraphView
                  findings={findings}
                  onNodeClick={handleNodeClick}
                  onJumpToLine={handleJumpToLine}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* 3. Right Section Panel with Image 1 card styling (currently blank as requested) */}
      {isRightSectionOpen && (
        <>
          <ResizableSplitter
            onResize={(delta) =>
              setRightSectionWidth((prev) => Math.max(180, Math.min(600, prev - delta)))
            }
            onReset={() => setRightSectionWidth(280)}
            title="Resize Right Section (double click to reset)"
          />

          <div
            style={{ width: `${rightSectionWidth}px` }}
            className="flex flex-col h-full shrink-0 rounded-lg border border-[#303031] bg-[#252526] overflow-hidden shadow-sm"
          >
            <ChatPanel
              turns={chatTurns}
              isStreaming={isChatStreaming}
              onSubmit={handleChatSubmit}
              onSelectFinding={handleSelectFinding}
              onOpenInGraphView={handleChatOpenInGraphView}
              onClearHistory={() => setChatTurns([])}

              onNewChat={() => setChatTurns([])}
              onSelectSession={(sess: ChatSession) => setChatTurns([...sess.turns])}
              onClose={() => setIsRightSectionOpen(false)}
            />
          </div>
        </>
      )}

      {/* 4. Quick Search Command Palette Modal */}
      <QuickSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        findings={findings}
        workspaceGraph={workspaceGraph}
        currentFolderPath={selectedFolder}
        onSelectFinding={handleSelectFinding}
        onSelectFile={handleSelectFileFromSearch}
        onSelectFolder={(folderPath) => {
          setSelectedFolder(folderPath);
          handleScanWorkspace(folderPath);
        }}
      />

      {/* Settings & Scan History Modal */}
      <SettingsHistoryModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsTab}
        account={userAccount}
        onSaveAccount={handleSaveAccount}
        onLogout={handleLogout}
        settings={userSettings}
        onSaveSettings={handleSaveSettings}
        scanSessions={scanSessions}
        onRestoreSession={handleRestoreSession}
        onDeleteSession={handleDeleteSession}
        onClearAllHistory={handleClearAllHistory}
        onGenerateReport={handleGenerateReport}
        onSaveFile={handleSaveReportFile}
        onRequestPasswordReset={handleForgotPassword}
        onVerifyResetOtp={handleVerifyResetOtp}
        onResetPassword={handleResetPassword}
        onVerifyEmail={handleVerifyEmail}
        onResendEmailCode={handleResendEmailCode}
        onListApiKeys={handleListApiKeys}
        onCreateApiKey={handleCreateApiKey}
        onRevokeApiKey={handleRevokeApiKey}
      />

      {/* Current-scan report preview, opened from the top navbar Download dropdown */}
      <ReportView
        isOpen={isCurrentReportOpen}
        report={currentReport}
        highlightFormat={currentReportFormat}
        onSaveFile={handleSaveReportFile}
        onClose={() => setIsCurrentReportOpen(false)}
      />
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <BridgeProvider client={bridge}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BridgeProvider>,
  );
}
