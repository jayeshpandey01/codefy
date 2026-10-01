import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import type {
  DeveloperApiKey,
  GeneratedReport,
  RuleToggleConfig,
  ScanSessionEntry,
  SecurityTip,
  SettingsModalTabId,
  UserAccount,
  UserSettings,
} from "@whoami/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  CodefyLogo,
  CopyIcon,
  DiamondIcon,
  EyeIcon,
  EyeOffIcon,
  FileCodeIcon,
  FolderIcon,
  HistoryIcon,
  KeyIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "./Icons.js";
import { ReportView } from "./ReportView.js";
import { ThemePicker } from "./ThemePicker.js";
import { useTheme } from "./ThemeContext.js";

export interface SettingsHistoryModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly initialTab?: SettingsModalTabId;
  readonly account: UserAccount;
  readonly onLogout?: () => Promise<void> | void;
  readonly onSaveAccount?: (newAccount: UserAccount) => Promise<void> | void;
  readonly settings?: UserSettings;
  readonly onSaveSettings?: (settings: UserSettings) => Promise<void> | void;
  readonly scanSessions: readonly ScanSessionEntry[];
  readonly onRestoreSession?: (sessionId: string) => Promise<void> | void;
  readonly onDeleteSession?: (sessionId: string) => Promise<void> | void;
  readonly onClearAllHistory?: () => Promise<void> | void;
  readonly onGenerateReport?: (sessionId: string) => Promise<GeneratedReport>;
  readonly tips?: readonly SecurityTip[];

  // Enhanced Account actions
  readonly onRequestPasswordReset?: (email: string) => Promise<unknown>;
  readonly onVerifyResetOtp?: (email: string, code: string) => Promise<unknown>;
  readonly onResetPassword?: (req: { email: string; code: string; newPassword: string }) => Promise<unknown>;
  readonly onVerifyEmail?: (email: string, code: string) => Promise<unknown>;
  readonly onResendEmailCode?: (email: string) => Promise<unknown>;
  readonly onListApiKeys?: () => Promise<readonly DeveloperApiKey[]>;
  readonly onCreateApiKey?: (
    name: string,
    expiresDays?: number,
  ) => Promise<{ key: string; name: string; id: string } | null>;
  readonly onRevokeApiKey?: (keyId: string) => Promise<boolean | void>;
  readonly onRefreshProfile?: () => Promise<UserAccount | null>;
}

const DEFAULT_TIPS: readonly SecurityTip[] = [
  {
    id: "tip-cmd",
    category: "Security Hygiene",
    title: "Prevent Shell Command Injections",
    summary:
      "Avoid string concatenation in child_process.exec(). Use execFile() or spawn() with arguments in an array to bypass OS shell command interpretation.",
    codeSnippet: `// ❌ Dangerous\nchild_process.exec("ping -c 1 " + req.query.host);\n\n// ✅ Protected\nchild_process.execFile("ping", ["-c", "1", req.query.host]);`,
    cwe: "CWE-78",
  },
  {
    id: "tip-sql",
    category: "Security Hygiene",
    title: "Use Parameterized SQL Queries",
    summary:
      "Never interpolate untrusted parameters into query strings. Use parameterized binding ($1, ?, :param) so the database engine parses SQL structure separately from user data.",
    codeSnippet: `// ❌ Vulnerable concat\ndb.query(\`SELECT * FROM users WHERE id = '\${id}'\`);\n\n// ✅ Parameterized\ndb.query("SELECT * FROM users WHERE id = $1", [id]);`,
    cwe: "CWE-89",
  },
  {
    id: "tip-ssrf",
    category: "Security Hygiene",
    title: "Validate Outbound URLs Against SSRF",
    summary:
      "Validate user-supplied URLs against an allowlist of permitted domain names and restrict requests targeting loopback (127.0.0.1) or cloud metadata endpoints (169.254.169.254).",
    codeSnippet: `const url = new URL(req.body.targetUrl);\nif (!ALLOWED_DOMAINS.includes(url.hostname)) {\n  throw new Error("Target host not permitted");\n}`,
    cwe: "CWE-918",
  },
  {
    id: "tip-ast",
    category: "AST & Taint",
    title: "Deterministic Taint Flow Analysis",
    summary:
      "Static analysis tracks untrusted input from Sources through AST assignments and function arguments to Sinks. Sanitizers on the path neutralize the taint flow.",
  },
  {
    id: "tip-nav",
    category: "Shortcuts",
    title: "Workspace Keyboard Shortcuts",
    summary:
      "• Cmd/Ctrl + K: Quick Search Command Palette\n• Cmd/Ctrl + B: Toggle Left Issues Sidebar\n• Cmd/Ctrl + ,: Open Settings & Preferences\n• / (slash): Open Quick Search\n• Esc: Close active modal / reset selection\n• Double click splitter: Reset panels to default width",
  },
];

const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "dark",
  autoScanOnOpen: true,
  defaultLayoutDirection: "DOWN",
  defaultGraphTab: "graph",
  graphViewMode: "all",
  defaultScanMode: "local-offline",
  analysisPipelineMode: "bugs",
  rules: {
    commandInjection: true,
    sqlInjection: true,
    ssrf: true,
    pathTraversal: true,
    codeInjection: true,
    secretDetection: true,
  },
  customExcludedDirs: ["tests", "fixtures", "demo"],
  maxScannableFiles: 5000,
  selectedAiModel: "anthropic/claude-3.5-sonnet",
  enableTelemetry: false,
  maskAbsolutePaths: true,
  maxScanHistory: 100,
};

export function SettingsHistoryModal({
  isOpen,
  onClose,
  initialTab = "account",
  account,
  onLogout,
  onSaveAccount,
  settings,
  onSaveSettings,
  scanSessions,
  onRestoreSession,
  onDeleteSession,
  onClearAllHistory,
  onGenerateReport,
  tips = DEFAULT_TIPS,
  onRequestPasswordReset,
  onVerifyResetOtp,
  onResetPassword,
  onVerifyEmail,
  onResendEmailCode,
  onListApiKeys,
  onCreateApiKey,
  onRevokeApiKey,
  onRefreshProfile,
}: SettingsHistoryModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<SettingsModalTabId>(initialTab);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme: currentTheme, setTheme } = useTheme();

  // Account tab states:
  // 1. Email Verification
  const [accountEmailVerified, setAccountEmailVerified] = useState<boolean>(
    Boolean(account.emailVerified),
  );
  useEffect(() => {
    setAccountEmailVerified(Boolean(account.emailVerified));
  }, [account.emailVerified]);


  const [showEmailVerifyBox, setShowEmailVerifyBox] = useState<boolean>(false);
  const [emailVerifyCode, setEmailVerifyCode] = useState<string>("");
  const [emailVerifyBusy, setEmailVerifyBusy] = useState<boolean>(false);
  const [emailVerifyError, setEmailVerifyError] = useState<string | null>(null);
  const [emailVerifySuccess, setEmailVerifySuccess] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleStartEmailVerify = async () => {
    setShowEmailVerifyBox(true);
    setEmailVerifyError(null);
    setEmailVerifySuccess(null);
    if (resendCooldown === 0 && onResendEmailCode) {
      try {
        await onResendEmailCode(account.email);
        setResendCooldown(60);
        setEmailVerifySuccess("Verification code sent to your email.");
      } catch (err) {
        setEmailVerifyError(err instanceof Error ? err.message : "Failed to send code.");
      }
    }
  };

  const handleResendVerificationCode = async () => {
    if (resendCooldown > 0 || !onResendEmailCode) return;
    setEmailVerifyError(null);
    setEmailVerifySuccess(null);
    try {
      await onResendEmailCode(account.email);
      setResendCooldown(60);
      setEmailVerifySuccess("New verification code sent!");
    } catch (err) {
      setEmailVerifyError(err instanceof Error ? err.message : "Failed to resend code.");
    }
  };

  const handleVerifyEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onVerifyEmail) return;
    const cleanCode = emailVerifyCode.trim();
    if (cleanCode.length !== 6) {
      setEmailVerifyError("Please enter a valid 6-digit code.");
      return;
    }
    setEmailVerifyBusy(true);
    setEmailVerifyError(null);
    setEmailVerifySuccess(null);
    try {
      await onVerifyEmail(account.email, cleanCode);
      setAccountEmailVerified(true);
      setEmailVerifySuccess("Email successfully verified! ✓");
      setTimeout(() => {
        setShowEmailVerifyBox(false);
        setEmailVerifySuccess(null);
      }, 2000);
    } catch (err) {
      setEmailVerifyError(
        err instanceof Error ? err.message : "Verification failed. Invalid or expired code.",
      );
    } finally {
      setEmailVerifyBusy(false);
    }
  };

  // 2. Password Reset (3-Step OWASP & NIST flow)
  type ResetStep = "idle" | "request_otp" | "verify_otp" | "new_password" | "success";
  const [resetStep, setResetStep] = useState<ResetStep>("idle");
  const [resetEmail, setResetEmail] = useState<string>(account.email || "");
  const [resetOtp, setResetOtp] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [resetBusy, setResetBusy] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (account.email) setResetEmail(account.email);
  }, [account.email]);

  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, label: "None", color: "bg-vscode-btn-secondary" };
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (newPassword.length >= 12) score += 1;
    if (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)) score += 1;
    if (/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) score += 1;

    if (score <= 1) return { score: 1, label: "Weak (min. 8 chars)", color: "bg-severity-critical" };
    if (score === 2) return { score: 2, label: "Fair", color: "bg-severity-high" };
    if (score === 3) return { score: 3, label: "Good", color: "bg-severity-medium" };
    return { score: 4, label: "Strong (NIST recommended)", color: "bg-severity-low" };
  }, [newPassword]);

  const handleStartPasswordReset = () => {
    setResetStep("request_otp");
    setResetError(null);
    setResetSuccess(null);
    setResetOtp("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleRequestOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRequestPasswordReset) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await onRequestPasswordReset(resetEmail.trim());
      setResetStep("verify_otp");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to send reset code.");
    } finally {
      setResetBusy(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onVerifyResetOtp) {
      setResetStep("new_password");
      return;
    }
    const cleanCode = resetOtp.trim();
    if (cleanCode.length !== 6) {
      setResetError("Please enter the 6-digit code.");
      return;
    }
    setResetBusy(true);
    setResetError(null);
    try {
      await onVerifyResetOtp(resetEmail.trim(), cleanCode);
      setResetStep("new_password");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Invalid or expired reset code.");
    } finally {
      setResetBusy(false);
    }
  };

  const handleCommitPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setResetError("Password must be at least 8 characters long per NIST SP 800-63B.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    if (!onResetPassword) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await onResetPassword({
        email: resetEmail.trim(),
        code: resetOtp.trim(),
        newPassword,
      });
      setResetStep("success");
      setResetSuccess("Password reset successfully! You can now use your new password.");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setResetBusy(false);
    }
  };

  // 3. Developer API Keys
  const [apiKeys, setApiKeys] = useState<readonly DeveloperApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<boolean>(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState<boolean>(false);
  const [newKeyName, setNewKeyName] = useState<string>("");
  const [newKeyExpiryDays, setNewKeyExpiryDays] = useState<number>(30);
  const [creatingKey, setCreatingKey] = useState<boolean>(false);
  const [createdKeyResult, setCreatedKeyResult] = useState<{
    key: string;
    name: string;
    id: string;
  } | null>(null);
  const [copiedKeyToast, setCopiedKeyToast] = useState<boolean>(false);
  const [keyActionError, setKeyActionError] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const loadApiKeys = useCallback(async () => {
    if (!onListApiKeys) return;
    setLoadingKeys(true);
    setKeyActionError(null);
    try {
      const keys = await onListApiKeys();
      setApiKeys(keys || []);
    } catch {
      // ignore
    } finally {
      setLoadingKeys(false);
    }
  }, [onListApiKeys]);

  useEffect(() => {
    if (activeTab === "account") {
      void loadApiKeys();
    }
  }, [activeTab, loadApiKeys]);

  const handleCreateApiKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateApiKey || !newKeyName.trim()) return;
    setCreatingKey(true);
    setKeyActionError(null);
    try {
      const res = await onCreateApiKey(
        newKeyName.trim(),
        newKeyExpiryDays > 0 ? newKeyExpiryDays : undefined,
      );
      if (res) {
        setCreatedKeyResult(res);
        setNewKeyName("");
        void loadApiKeys();
      }
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : "Failed to generate API key.");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeApiKeyClick = async (keyId: string) => {
    if (!onRevokeApiKey) return;
    setRevokingKeyId(keyId);
    setKeyActionError(null);
    try {
      await onRevokeApiKey(keyId);
      setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch (err) {
      setKeyActionError(err instanceof Error ? err.message : "Failed to revoke key.");
    } finally {
      setRevokingKeyId(null);
    }
  };

  const handleCopyKeyToClipboard = (keyVal: string) => {
    navigator.clipboard.writeText(keyVal);
    setCopiedKeyToast(true);
    setTimeout(() => setCopiedKeyToast(false), 2000);
  };

  // Form states for Engine & Scanner
  const [rules, setRules] = useState<RuleToggleConfig>(
    settings?.rules || {
      commandInjection: true,
      sqlInjection: true,
      ssrf: true,
      pathTraversal: true,
      codeInjection: true,
      secretDetection: true,
    },
  );
  const [excludedDirs, setExcludedDirs] = useState<string[]>(
    settings?.customExcludedDirs ? [...settings.customExcludedDirs] : ["tests", "fixtures", "demo"],
  );
  const [newExcludeDir, setNewExcludeDir] = useState("");
  const [autoScanOnOpen, setAutoScanOnOpen] = useState(settings?.autoScanOnOpen ?? true);
  const [defaultLayoutDir, setDefaultLayoutDir] = useState<"DOWN" | "RIGHT">(
    settings?.defaultLayoutDirection || "DOWN",
  );
  const [defaultGraphTab, setDefaultGraphTab] = useState(
    settings?.defaultGraphTab || "graph",
  );
  const [analysisPipelineMode, setAnalysisPipelineMode] = useState<"bugs" | "full">(
    settings?.analysisPipelineMode || "bugs",
  );

  // History search filter
  const [historySearch, setHistorySearch] = useState("");
  const [reportViewSessionId, setReportViewSessionId] = useState<string | null>(null);
  const [reportViewData, setReportViewData] = useState<GeneratedReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Tips category filter & copy feedback
  const [tipCategory, setTipCategory] = useState<string>("All");
  const [copiedTipId, setCopiedTipId] = useState<string | null>(null);

  // Sync state with incoming props
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (settings) {
      if (settings.rules) setRules(settings.rules);
      if (settings.customExcludedDirs) setExcludedDirs([...settings.customExcludedDirs]);
      setAutoScanOnOpen(settings.autoScanOnOpen ?? true);
      setDefaultLayoutDir(settings.defaultLayoutDirection || "DOWN");
      setDefaultGraphTab(settings.defaultGraphTab || "graph");
      setAnalysisPipelineMode(settings.analysisPipelineMode || "bugs");
    }
  }, [settings]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSaveAll = useCallback(async () => {
    try {
      if (onSaveSettings) {
        await onSaveSettings({
          ...(settings || DEFAULT_USER_SETTINGS),
          rules,
          customExcludedDirs: excludedDirs,
          autoScanOnOpen,
          defaultLayoutDirection: defaultLayoutDir,
          defaultGraphTab,
          analysisPipelineMode,
        });
      }

      setSaveStatus("Saved to Local Database! ✓");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("Failed to save settings");
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [
    settings,
    onSaveSettings,
    rules,
    excludedDirs,
    autoScanOnOpen,
    defaultLayoutDir,
    defaultGraphTab,
    analysisPipelineMode,
  ]);

  const handleLogout = useCallback(async () => {
    if (!onLogout) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }, [onLogout]);

  const handleAddExcludeDir = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newExcludeDir.trim()) {
      e.preventDefault();
      const val = newExcludeDir.trim().toLowerCase();
      if (!excludedDirs.includes(val)) {
        setExcludedDirs([...excludedDirs, val]);
      }
      setNewExcludeDir("");
    }
  };

  const handleRemoveExcludeDir = (dirToRemove: string) => {
    setExcludedDirs(excludedDirs.filter((d) => d !== dirToRemove));
  };

  const handleExportHistoryJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(scanSessions, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute(
      "download",
      `whoami-scan-history-${new Date().toISOString().slice(0, 10)}.json`,
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleGenerateReport = async (sessionId: string) => {
    if (!onGenerateReport) return;
    setReportViewSessionId(sessionId);
    setReportViewData(null);
    setIsGeneratingReport(true);
    try {
      const report = await onGenerateReport(sessionId);
      setReportViewData(report);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleCloseReportView = () => {
    setReportViewSessionId(null);
    setReportViewData(null);
  };

  const handleCopyCodeSnippet = (tipId: string, snippet?: string) => {
    if (!snippet) return;
    navigator.clipboard.writeText(snippet);
    setCopiedTipId(tipId);
    setTimeout(() => setCopiedTipId(null), 2000);
  };

  const filteredSessions = useMemo(() => {
    if (!historySearch.trim()) return scanSessions;
    const q = historySearch.toLowerCase();
    return scanSessions.filter(
      (s) =>
        s.workspacePath.toLowerCase().includes(q) ||
        s.mode.toLowerCase().includes(q),
    );
  }, [scanSessions, historySearch]);

  const filteredTips = useMemo(() => {
    if (tipCategory === "All") return tips;
    return tips.filter((t) => t.category === tipCategory);
  }, [tips, tipCategory]);

  if (!isOpen) return null;

  const modalElement = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings and History"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-sans select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-[620px] w-full max-w-4xl overflow-hidden rounded-xl border border-vscode-border bg-vscode-bg shadow-2xl">
        {/* Top Right Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover active:bg-vscode-card-hover transition-colors cursor-pointer"
        >
          <XIcon size={16} />
        </button>

        {/* Left Navigation Sidebar */}
        <div className="w-52 shrink-0 border-r border-vscode-border bg-vscode-header p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 px-2.5 py-2 mb-3">
              <CodefyLogo size={20} className="text-vscode-focus" />
              <span className="text-xs font-bold uppercase tracking-wider text-vscode-fg">
                WhoAmI
              </span>
            </div>

            <nav className="flex flex-col gap-1">
              {/* 1. Account */}
              <button
                type="button"
                onClick={() => setActiveTab("account")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "account"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <SettingsIcon size={14} />
                <span>Account</span>
              </button>

              {/* 2. Engine & Rules */}
              <button
                type="button"
                onClick={() => setActiveTab("engine")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "engine"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <ShieldAlertIcon size={14} />
                <span>Engine & Rules</span>
              </button>

              {/* 3. Tips */}
              {/* 3. Appearance */}
              <button
                type="button"
                onClick={() => setActiveTab("appearance")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "appearance"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                  <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                  <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                  <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                </svg>
                <span>Appearance</span>
              </button>

              {/* 4. Tips */}
              <button
                type="button"
                onClick={() => setActiveTab("tips")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "tips"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <SparklesIcon size={14} />
                <span>Tips</span>
              </button>

              {/* 4. History */}
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "history"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <HistoryIcon size={14} />
                <span className="flex-1 text-left">History</span>
                {scanSessions.length > 0 && (
                  <span className="rounded-full bg-vscode-border px-1.5 py-0.2 text-[10px] font-mono text-vscode-muted">
                    {scanSessions.length}
                  </span>
                )}
              </button>

              {/* 5. About */}
              <button
                type="button"
                onClick={() => setActiveTab("about")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "about"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <ShieldCheckIcon size={14} />
                <span>About</span>
              </button>

              {/* 6. Plans */}
              <button
                type="button"
                onClick={() => setActiveTab("plans")}
                className={`flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === "plans"
                    ? "bg-vscode-focus/15 text-severity-medium border border-vscode-focus/30"
                    : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
                }`}
              >
                <DiamondIcon size={14} />
                <span>Plans</span>
              </button>
            </nav>
          </div>

          {/* Bottom DB Info -- deliberately no DB/file name here, see the
              data-sharing/security review this component was hardened for */}
          <div className="rounded border border-vscode-border bg-vscode-bg p-2 text-[10px] font-mono text-vscode-dim">
            <div>Local Storage</div>
            <div className="text-severity-low">Status: Connected</div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-vscode-bg overflow-y-auto p-6">
          {/* ================= TAB: APPEARANCE ================= */}
          {activeTab === "appearance" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-lg font-bold text-vscode-fg tracking-wide">Theme & Appearance</h2>
                <p className="text-xs text-vscode-muted mt-0.5">
                  Choose a color theme for the editor. Changes apply instantly.
                </p>
              </div>
              <ThemePicker
                showHint
                onThemeChange={(id) => {
                  if (onSaveSettings) {
                    void onSaveSettings({
                      ...(settings ?? DEFAULT_USER_SETTINGS),
                      rules,
                      customExcludedDirs: excludedDirs,
                      autoScanOnOpen,
                      defaultLayoutDirection: defaultLayoutDir,
                      defaultGraphTab,
                      analysisPipelineMode,
                      theme: id as UserSettings["theme"],
                    });
                  }
                }}
              />
            </div>
          )}

          {/* ================= TAB 1: ACCOUNT ================= */}
          {activeTab === "account" && (
            <div className="flex flex-col gap-6 max-w-xl">
              <div>
                <h2 className="text-lg font-bold text-vscode-fg tracking-wide">Account Profile & Security</h2>
                <p className="text-xs text-vscode-muted mt-0.5">
                  Signed in to your WhoAmI account.
                </p>
              </div>

              {/* 1. Profile & Verification Card */}
              <div className="rounded-lg border border-vscode-border bg-vscode-card p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-vscode-focus/20 text-sm font-bold text-severity-medium border border-vscode-focus/40">
                      {account.name ? account.name.slice(0, 2).toUpperCase() : "ME"}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-vscode-fg">{account.name}</div>
                      <div className="text-xs text-vscode-muted">{account.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-vscode-focus/30 bg-vscode-focus/15 px-2.5 py-0.5 text-xs font-mono font-medium text-severity-medium capitalize">
                      {account.tier} Active
                    </span>
                    {accountEmailVerified ? (
                      <span className="flex items-center gap-1 rounded-full border border-severity-low/30 bg-severity-low/15 px-2.5 py-0.5 text-xs font-mono font-medium text-severity-low">
                        <CheckIcon size={12} />
                        <span>Verified ✓</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full border border-severity-high/30 bg-severity-high/15 px-2.5 py-0.5 text-xs font-mono font-medium text-severity-high">
                        <ShieldAlertIcon size={12} />
                        <span>Unverified</span>
                      </span>
                    )}
                  </div>
                </div>

                {!accountEmailVerified && (
                  <div className="rounded-md border border-severity-high/30 bg-severity-high/10 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-vscode-fg">
                        Your email is not verified yet. Verify it to enable cloud security sync and alerts.
                      </div>
                      {!showEmailVerifyBox && (
                        <button
                          type="button"
                          onClick={handleStartEmailVerify}
                          className="shrink-0 rounded bg-severity-high/20 hover:bg-severity-high/30 text-vscode-fg border border-severity-high/40 px-3 py-1 text-xs font-semibold transition cursor-pointer"
                        >
                          Verify Email
                        </button>
                      )}
                    </div>

                    {showEmailVerifyBox && (
                      <form
                        onSubmit={handleVerifyEmailSubmit}
                        className="mt-2 pt-2 border-t border-severity-high/20 flex flex-col gap-2.5"
                      >
                        <div className="text-xs font-medium text-vscode-fg">
                          Enter 6-digit verification code sent to{" "}
                          <span className="text-severity-medium font-mono">{account.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={emailVerifyCode}
                            onChange={(e) =>
                              setEmailVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                            }
                            required
                            maxLength={6}
                            placeholder="123456"
                            className="w-36 rounded border border-vscode-border bg-vscode-header px-3 py-1.5 text-sm font-mono tracking-widest text-center text-vscode-fg focus:border-vscode-focus focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={emailVerifyBusy || emailVerifyCode.trim().length !== 6}
                            className="rounded bg-vscode-focus hover:bg-vscode-primary-hover disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                          >
                            {emailVerifyBusy ? "Verifying…" : "Submit Code"}
                          </button>
                          <button
                            type="button"
                            onClick={handleResendVerificationCode}
                            disabled={resendCooldown > 0}
                            className="text-xs text-severity-medium hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                          >
                            {resendCooldown > 0
                              ? `Resend in ${resendCooldown}s`
                              : "Resend Code"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEmailVerifyBox(false)}
                            className="text-xs text-vscode-muted hover:text-vscode-fg ml-auto cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                        {emailVerifyError && (
                          <div className="text-xs text-severity-critical">{emailVerifyError}</div>
                        )}
                        {emailVerifySuccess && (
                          <div className="text-xs text-severity-low">{emailVerifySuccess}</div>
                        )}
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Password & Authentication Card (OWASP & NIST SP 800-63B) */}
              <div className="rounded-lg border border-vscode-border bg-vscode-card p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vscode-focus/15 text-severity-medium">
                      <LockIcon size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-vscode-fg">
                        Password & Security
                      </div>
                      <div className="text-[11px] text-vscode-muted">
                        OWASP & NIST SP 800-63B compliant password recovery
                      </div>
                    </div>
                  </div>

                  {resetStep === "idle" && (
                    <button
                      type="button"
                      onClick={handleStartPasswordReset}
                      className="rounded border border-vscode-border bg-vscode-bg hover:bg-vscode-card-hover hover:border-vscode-focus/50 px-3 py-1.5 text-xs font-medium text-vscode-fg transition cursor-pointer"
                    >
                      Reset Password
                    </button>
                  )}
                </div>

                {resetStep === "request_otp" && (
                  <form
                    onSubmit={handleRequestOtpSubmit}
                    className="mt-2 rounded-md border border-vscode-border bg-vscode-header p-3 flex flex-col gap-2.5 animate-in fade-in duration-150"
                  >
                    <div className="text-xs font-semibold text-vscode-fg">
                      Step 1: Request Password Reset Code
                    </div>
                    <p className="text-[11px] text-vscode-muted">
                      We will send a 6-digit one-time passcode to your email.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        required
                        placeholder="your@email.com"
                        className="flex-1 rounded border border-vscode-border bg-vscode-card px-3 py-1.5 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={resetBusy || !resetEmail.trim()}
                        className="rounded bg-vscode-focus hover:bg-vscode-primary-hover disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        {resetBusy ? "Sending…" : "Send 6-Digit OTP"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetStep("idle")}
                        className="text-xs text-vscode-muted hover:text-vscode-fg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    {resetError && <div className="text-xs text-severity-critical">{resetError}</div>}
                  </form>
                )}

                {resetStep === "verify_otp" && (
                  <form
                    onSubmit={handleVerifyOtpSubmit}
                    className="mt-2 rounded-md border border-vscode-border bg-vscode-header p-3 flex flex-col gap-2.5 animate-in fade-in duration-150"
                  >
                    <div className="text-xs font-semibold text-vscode-fg">
                      Step 2: Enter 6-Digit Reset Code
                    </div>
                    <p className="text-[11px] text-vscode-muted">
                      Enter the 6-digit code sent to{" "}
                      <span className="text-severity-medium font-mono">{resetEmail}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={resetOtp}
                        onChange={(e) =>
                          setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        required
                        maxLength={6}
                        placeholder="123456"
                        className="w-36 rounded border border-vscode-border bg-vscode-card px-3 py-1.5 text-sm font-mono tracking-widest text-center text-vscode-fg focus:border-vscode-focus focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={resetBusy || resetOtp.trim().length !== 6}
                        className="rounded bg-vscode-focus hover:bg-vscode-primary-hover disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        {resetBusy ? "Verifying…" : "Verify Code"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetStep("idle")}
                        className="text-xs text-vscode-muted hover:text-vscode-fg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    {resetError && <div className="text-xs text-severity-critical">{resetError}</div>}
                  </form>
                )}

                {resetStep === "new_password" && (
                  <form
                    onSubmit={handleCommitPasswordSubmit}
                    className="mt-2 rounded-md border border-vscode-border bg-vscode-header p-3 flex flex-col gap-3 animate-in fade-in duration-150"
                  >
                    <div className="text-xs font-semibold text-vscode-fg">
                      Step 3: Set New Password
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          minLength={8}
                          placeholder="New password (min. 8 characters)"
                          className="w-full rounded border border-vscode-border bg-vscode-card px-3 py-1.5 pr-8 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          className="absolute right-2.5 top-1.5 text-vscode-muted hover:text-vscode-fg cursor-pointer"
                        >
                          {showNewPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                        </button>
                      </div>

                      {/* NIST Password Strength Meter */}
                      {newPassword.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-vscode-border overflow-hidden flex">
                            <div
                              className={`h-full transition-all duration-200 ${passwordStrength.color}`}
                              style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-vscode-muted font-mono shrink-0">
                            {passwordStrength.label}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="Confirm new password"
                        className="w-full rounded border border-vscode-border bg-vscode-card px-3 py-1.5 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={
                          resetBusy ||
                          newPassword.length < 8 ||
                          newPassword !== confirmPassword
                        }
                        className="rounded bg-vscode-focus hover:bg-vscode-primary-hover disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                      >
                        {resetBusy ? "Updating…" : "Commit New Password"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetStep("idle")}
                        className="text-xs text-vscode-muted hover:text-vscode-fg cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    {resetError && <div className="text-xs text-severity-critical">{resetError}</div>}
                  </form>
                )}

                {resetStep === "success" && (
                  <div className="mt-2 rounded-md border border-severity-low/30 bg-severity-low/10 p-3 flex items-center justify-between animate-in fade-in">
                    <div className="text-xs text-severity-low font-medium">{resetSuccess}</div>
                    <button
                      type="button"
                      onClick={() => setResetStep("idle")}
                      className="rounded bg-severity-low/20 hover:bg-severity-low/30 text-severity-low px-2.5 py-1 text-xs font-semibold cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Developer API Keys Card */}
              <div className="rounded-lg border border-vscode-border bg-vscode-card p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-severity-high/15 text-severity-high">
                      <KeyIcon size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-vscode-fg">
                        Developer API Keys
                      </div>
                      <div className="text-[11px] text-vscode-muted">
                        Bearer tokens for CLI scanners, CI/CD pipelines, and automations
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateKeyModal(true);
                      setCreatedKeyResult(null);
                      setKeyActionError(null);
                    }}
                    className="flex items-center gap-1 rounded border border-vscode-border bg-vscode-bg hover:bg-vscode-card-hover hover:border-vscode-focus/50 px-3 py-1.5 text-xs font-medium text-vscode-fg transition cursor-pointer"
                  >
                    <PlusIcon size={12} />
                    <span>Generate Key</span>
                  </button>
                </div>

                {keyActionError && (
                  <div className="text-xs text-severity-critical bg-severity-critical/10 border border-severity-critical/30 p-2 rounded">
                    {keyActionError}
                  </div>
                )}

                {/* Create Key Inline Modal / Flow */}
                {showCreateKeyModal && (
                  <div className="rounded-md border border-vscode-border bg-vscode-header p-3 flex flex-col gap-3 animate-in fade-in duration-150">
                    {!createdKeyResult ? (
                      <form onSubmit={handleCreateApiKeySubmit} className="flex flex-col gap-2.5">
                        <div className="text-xs font-semibold text-vscode-fg">
                          Generate New Developer API Key
                        </div>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="token-description-input"
                            className="text-[11px] text-vscode-muted"
                          >
                            Key Description
                          </label>
                          <input
                            id="token-description-input"
                            type="text"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            required
                            placeholder="e.g. GitHub Actions Runner"
                            className="rounded border border-vscode-border bg-vscode-card px-3 py-1.5 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-vscode-muted">Expires In:</span>
                            <select
                              value={newKeyExpiryDays}
                              onChange={(e) => setNewKeyExpiryDays(Number(e.target.value))}
                              className="rounded border border-vscode-border bg-vscode-card px-2 py-1 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none cursor-pointer"
                            >
                              <option value={30}>30 Days</option>
                              <option value={60}>60 Days</option>
                              <option value={90}>90 Days</option>
                              <option value={365}>1 Year</option>
                              <option value={0}>Never Expire</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              type="submit"
                              disabled={creatingKey || !newKeyName.trim()}
                              className="rounded bg-vscode-focus hover:bg-vscode-primary-hover disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer"
                            >
                              {creatingKey ? "Generating…" : "Create Key"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCreateKeyModal(false)}
                              className="text-xs text-vscode-muted hover:text-vscode-fg cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-2.5 animate-in fade-in">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#E5C07B]">
                          <AlertTriangleIcon size={14} className="shrink-0" />
                          <span>Save this key now — it will never be displayed again!</span>
                        </div>
                        <div className="flex items-center gap-2 rounded border border-vscode-border bg-vscode-card p-2 font-mono text-xs text-severity-low select-all break-all">
                          <span className="flex-1">{createdKeyResult.key}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyKeyToClipboard(createdKeyResult.key)}
                            title="Copy API Key"
                            className="rounded p-1 bg-vscode-border hover:bg-vscode-btn-secondary text-vscode-fg transition shrink-0 cursor-pointer"
                          >
                            {copiedKeyToast ? (
                              <CheckIcon size={14} className="text-severity-low" />
                            ) : (
                              <CopyIcon size={14} />
                            )}
                          </button>
                        </div>
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreateKeyModal(false);
                              setCreatedKeyResult(null);
                            }}
                            className="rounded bg-vscode-focus hover:bg-vscode-primary-hover text-white px-4 py-1 text-xs font-semibold cursor-pointer"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* API Keys Table */}
                <div className="flex flex-col gap-1">
                  {loadingKeys ? (
                    <div className="text-xs text-vscode-muted py-2">Loading API keys…</div>
                  ) : apiKeys.length === 0 ? (
                    <div className="text-xs text-vscode-dim py-2">
                      No developer API keys active. Generate one above to use WhoAmI via CLI or CI/CD.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 mt-1">
                      {apiKeys.map((k) => (
                        <div
                          key={k.id}
                          className="flex items-center justify-between rounded border border-vscode-border bg-vscode-bg px-3 py-2 text-xs"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-vscode-fg">
                              {k.keyName || k.name || "API Key"}
                            </span>
                            <span className="font-mono text-[10px] text-vscode-muted">
                              {k.prefix}••••••••
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-vscode-dim">
                              Expires:{" "}
                              {k.expiresAt
                                ? new Date(k.expiresAt).toLocaleDateString()
                                : "Never"}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRevokeApiKeyClick(k.id)}
                              disabled={revokingKeyId === k.id}
                              title="Revoke Key"
                              className="rounded p-1 text-vscode-muted hover:text-severity-critical hover:bg-severity-critical/10 transition cursor-pointer disabled:opacity-50"
                            >
                              <TrashIcon size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Active Session & Log Out Card */}
              <div className="rounded-lg border border-vscode-border bg-vscode-card p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-vscode-fg">
                    Active Workspace Session
                  </div>
                  <p className="text-[11px] text-vscode-muted mt-0.5">
                    Tokens are encrypted locally. Sign out to switch accounts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut || !onLogout}
                  className="flex items-center gap-1.5 rounded border border-severity-critical/40 bg-severity-critical/10 hover:bg-severity-critical/20 disabled:opacity-60 disabled:cursor-default px-4 py-1.5 text-xs font-semibold text-severity-critical transition-colors cursor-pointer"
                >
                  <span>{loggingOut ? "Logging out…" : "Log Out"}</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= TAB 2: ENGINE & RULES ================= */}
          {activeTab === "engine" && (
            <div className="flex flex-col gap-6 max-w-xl">
              <div>
                <h2 className="text-lg font-bold text-vscode-fg tracking-wide">
                  Analysis Engine & Rule Toggles
                </h2>
                <p className="text-xs text-vscode-muted mt-0.5">
                  Enable or disable specific static security rules, configure noise exclusions, and set file limits.
                </p>
              </div>

              {/* Rule Toggles Grid */}
              <div className="flex flex-col gap-2.5">
                <div className="text-xs font-bold text-vscode-fg uppercase tracking-wider mb-1">
                  Active AST Security Rules
                </div>

                {[
                  {
                    key: "commandInjection" as const,
                    name: "Command Injection (child_process)",
                    cwe: "CWE-78",
                  },
                  {
                    key: "sqlInjection" as const,
                    name: "SQL Injection (String Concat)",
                    cwe: "CWE-89",
                  },
                  {
                    key: "ssrf" as const,
                    name: "Server-Side Request Forgery (SSRF)",
                    cwe: "CWE-918",
                  },
                  {
                    key: "pathTraversal" as const,
                    name: "Path Traversal & Arbitrary Read",
                    cwe: "CWE-22",
                  },
                  {
                    key: "codeInjection" as const,
                    name: "Code Injection (eval / new Function)",
                    cwe: "CWE-94",
                  },
                  {
                    key: "secretDetection" as const,
                    name: "High-Entropy Hardcoded Secrets",
                    cwe: "CWE-798",
                  },
                ].map((rule) => (
                  <label
                    key={rule.key}
                    className="flex items-center justify-between rounded-lg border border-vscode-border bg-vscode-card p-3 cursor-pointer hover:border-vscode-border transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={rules[rule.key]}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            [rule.key]: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-vscode-border bg-vscode-header accent-vscode-focus cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-vscode-fg">
                        {rule.name}
                      </span>
                    </div>
                    <span className="rounded bg-vscode-bg border border-vscode-border px-2 py-0.5 text-[10px] font-mono text-vscode-focus">
                      {rule.cwe}
                    </span>
                  </label>
                ))}
              </div>

              {/* Custom Excluded Directories */}
              <div className="flex flex-col gap-2 pt-2 border-t border-vscode-border">
                <div className="text-xs font-bold text-vscode-fg uppercase tracking-wider">
                  Excluded Directories
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 rounded border border-vscode-border bg-vscode-header">
                  {excludedDirs.map((dir) => (
                    <span
                      key={dir}
                      className="inline-flex items-center gap-1 rounded bg-vscode-card border border-vscode-border px-2 py-0.5 text-[11px] font-mono text-vscode-fg"
                    >
                      {dir}
                      <button
                        type="button"
                        onClick={() => handleRemoveExcludeDir(dir)}
                        className="text-vscode-muted hover:text-severity-critical cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={newExcludeDir}
                    onChange={(e) => setNewExcludeDir(e.target.value)}
                    onKeyDown={handleAddExcludeDir}
                    placeholder="Add folder + Enter (e.g. tests)"
                    className="flex-1 min-w-[120px] bg-transparent text-xs text-vscode-fg placeholder-[#555] focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Workbench & UI Preferences */}
              <div className="flex flex-col gap-3 pt-2 border-t border-vscode-border">
                <div className="text-xs font-bold text-vscode-fg uppercase tracking-wider">
                  Workbench & Graph Layout
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-vscode-muted mb-1">
                      Default Layout Direction
                    </label>
                    <select
                      value={defaultLayoutDir}
                      onChange={(e) =>
                        setDefaultLayoutDir(e.target.value as "DOWN" | "RIGHT")
                      }
                      className="w-full rounded border border-vscode-border bg-vscode-header px-3 py-1.5 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none cursor-pointer"
                    >
                      <option value="DOWN">Top-to-Bottom (DOWN)</option>
                      <option value="RIGHT">Left-to-Right (RIGHT)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-vscode-muted mb-1">
                      Default Startup Tab
                    </label>
                    <select
                      value={defaultGraphTab}
                      onChange={(e) =>
                        setDefaultGraphTab(
                          e.target.value as UserSettings["defaultGraphTab"],
                        )
                      }
                      className="w-full rounded border border-vscode-border bg-vscode-header px-3 py-1.5 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none cursor-pointer"
                    >
                      <option value="graph">Data Flow DAG</option>
                      <option value="unified">Unified Architecture</option>
                      <option value="blast_radius">Threat Model & Blast Radius</option>
                      <option value="control_flow">Control Flow</option>
                      <option value="supply_chain">Supply Chain</option>
                      <option value="remote">Remote Attack Surface</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={autoScanOnOpen}
                    onChange={(e) => setAutoScanOnOpen(e.target.checked)}
                    className="h-4 w-4 rounded border-vscode-border bg-vscode-header accent-vscode-focus cursor-pointer"
                  />
                  <span className="text-xs text-vscode-fg">
                    Auto-scan folder immediately upon opening
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="flex items-center gap-1.5 rounded bg-vscode-focus hover:bg-vscode-primary-hover active:bg-[#004E82] px-4 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  <CheckIcon size={13} />
                  <span>Save Engine Configuration</span>
                </button>
                {saveStatus && (
                  <span className="text-xs font-medium text-severity-low">{saveStatus}</span>
                )}
              </div>
            </div>
          )}

          {/* ================= TAB 3: TIPS ================= */}
          {activeTab === "tips" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-bold text-vscode-fg tracking-wide">
                  Developer Security Tips
                </h2>
                <p className="text-xs text-vscode-muted mt-0.5">
                  Static taint patterns, vulnerability defenses, and IDE keyboard shortcuts.
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5">
                {["All", "Security Hygiene", "AST & Taint", "Shortcuts"].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTipCategory(cat)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition cursor-pointer ${
                      tipCategory === cat
                        ? "bg-vscode-focus text-white"
                        : "bg-vscode-card text-vscode-muted hover:text-vscode-fg"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                {filteredTips.map((tip) => (
                  <div
                    key={tip.id}
                    className="rounded-lg border border-vscode-border bg-vscode-card p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-vscode-bg border border-vscode-border px-2 py-0.5 text-[10px] font-mono text-vscode-focus uppercase font-semibold">
                          {tip.category}
                        </span>
                        <h3 className="text-xs font-bold text-vscode-fg">{tip.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {tip.cwe && (
                          <span className="rounded bg-severity-critical/15 border border-severity-critical/30 px-2 py-0.5 text-[10px] font-mono text-severity-critical">
                            {tip.cwe}
                          </span>
                        )}
                        {tip.codeSnippet && (
                          <button
                            type="button"
                            onClick={() => handleCopyCodeSnippet(tip.id, tip.codeSnippet)}
                            className="rounded bg-vscode-bg border border-vscode-border px-2 py-0.5 text-[10px] font-mono text-vscode-muted hover:text-vscode-fg transition cursor-pointer"
                          >
                            {copiedTipId === tip.id ? "Copied! ✓" : "Copy Snippet"}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-vscode-fg leading-relaxed whitespace-pre-line">
                      {tip.summary}
                    </p>
                    {tip.codeSnippet && (
                      <pre className="rounded border border-vscode-border bg-vscode-header p-2.5 text-[11px] font-mono text-[#4EC9B0] overflow-x-auto">
                        <code>{tip.codeSnippet}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================= TAB 4: HISTORY ================= */}
          {activeTab === "history" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-vscode-fg tracking-wide">
                    Scan History Collection
                  </h2>
                  <p className="text-xs text-vscode-muted mt-0.5">
                    Persistent log of all completed SAST and DAST scan sessions stored in local DB.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {scanSessions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExportHistoryJson}
                      className="rounded border border-vscode-focus/40 bg-vscode-focus/15 hover:bg-vscode-focus/25 px-2.5 py-1 text-xs text-severity-medium transition cursor-pointer"
                    >
                      Export JSON
                    </button>
                  )}
                  {scanSessions.length > 0 && onClearAllHistory && (
                    <button
                      type="button"
                      onClick={onClearAllHistory}
                      className="rounded border border-severity-critical/40 bg-severity-critical/10 hover:bg-severity-critical/20 px-2.5 py-1 text-xs text-severity-critical transition cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Filter / Search Bar */}
              {scanSessions.length > 0 && (
                <div className="relative">
                  <SearchIcon
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-vscode-muted"
                  />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Filter past scans by workspace path or mode…"
                    className="w-full rounded border border-vscode-border bg-vscode-header pl-8 pr-3 py-1.5 text-xs text-vscode-fg focus:border-vscode-focus focus:outline-none"
                  />
                </div>
              )}

              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-vscode-muted border border-dashed border-vscode-border rounded-lg">
                  <HistoryIcon size={32} className="text-vscode-dim/50 mb-2" />
                  <div className="text-sm font-semibold text-vscode-fg">
                    {scanSessions.length === 0
                      ? "No Scan History Yet"
                      : "No Matching Scan Runs Found"}
                  </div>
                  <div className="max-w-xs text-[11px] mt-1 text-vscode-muted">
                    Scan a workspace folder or run an orchestrator audit. Sessions and findings will be automatically preserved here.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filteredSessions.map((session) => {
                    const dateStr = new Date(session.startedAt).toLocaleString();
                    return (
                      <div
                        key={session.id}
                        className="rounded-lg border border-vscode-border bg-vscode-card p-3 flex items-center justify-between hover:border-vscode-border transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-vscode-header border border-vscode-border text-vscode-focus">
                            <FolderIcon size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-vscode-fg truncate max-w-sm">
                                {session.workspacePath || "Workspace Scan"}
                              </span>
                              <span className="rounded bg-vscode-bg border border-vscode-border px-1.5 py-0.2 text-[10px] font-mono text-severity-medium">
                                {session.mode}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-vscode-muted mt-0.5 font-mono">
                              <span>{dateStr}</span>
                              <span>•</span>
                              <span className="text-severity-high">
                                {session.findingsCount} finding(s)
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {onGenerateReport && (
                            <button
                              type="button"
                              onClick={() => handleGenerateReport(session.id)}
                              title="Generate a Markdown/PDF report for this scan"
                              className="flex items-center gap-1.5 rounded border border-vscode-border bg-vscode-header hover:bg-vscode-card-hover px-2.5 py-1 text-xs text-vscode-fg transition cursor-pointer"
                            >
                              <FileCodeIcon size={12} />
                              Report
                            </button>
                          )}
                          {onRestoreSession && (
                            <button
                              type="button"
                              onClick={() => {
                                onRestoreSession(session.id);
                                onClose();
                              }}
                              className="rounded bg-vscode-focus hover:bg-vscode-primary-hover px-2.5 py-1 text-xs font-medium text-white transition cursor-pointer"
                            >
                              Load into Workbench
                            </button>
                          )}
                          {onDeleteSession && (
                            <button
                              type="button"
                              onClick={() => onDeleteSession(session.id)}
                              title="Delete this session from DB"
                              className="flex h-7 w-7 items-center justify-center rounded text-vscode-muted hover:text-severity-critical hover:bg-vscode-card-hover transition-colors cursor-pointer"
                            >
                              <XIcon size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= TAB 5: ABOUT ================= */}
          {activeTab === "about" && (
            <div className="flex flex-col gap-6 max-w-xl">
              <div>
                <h2 className="text-lg font-bold text-vscode-fg tracking-wide">About</h2>
                <p className="text-xs text-vscode-muted mt-0.5">
                  Real-time security vulnerability finder and data-flow propagation tracer.
                </p>
              </div>

              <div className="rounded-lg border border-vscode-border bg-vscode-card p-4 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <CodefyLogo size={36} className="text-vscode-focus" />
                  <div>
                    <div className="text-sm font-bold text-vscode-fg">WhoAmI Desktop Workbench</div>
                    <div className="text-xs font-mono text-vscode-muted">
                      Version 0.1.0 (Build 2026.1)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-vscode-border">
                  <div>
                    <div className="text-[11px] text-vscode-muted">Analysis Engine</div>
                    <div className="font-medium text-vscode-fg">web-tree-sitter + ast-grep WASM</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-vscode-muted">Database Engine</div>
                    <div className="font-medium text-vscode-fg">Local Device Storage</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-vscode-muted">Execution Mode</div>
                    <div className="font-medium text-severity-low">Local-First, Offline-Capable</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-vscode-muted">Platform Host</div>
                    <div className="font-medium text-vscode-fg">Tauri v2 Desktop + VS Code</div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-vscode-muted leading-relaxed">
                WhoAmI is designed with developer trust as its primary principle: zero alert fatigue, deterministic taint flow tracking, and zero unverified findings.
              </div>
            </div>
          )}

          {/* ================= TAB 6: PLANS ================= */}
          {activeTab === "plans" && (
            <div className="flex flex-col items-center justify-center gap-4 h-full text-center py-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-vscode-focus/15 border border-vscode-focus/30">
                <DiamondIcon size={28} className="text-severity-medium" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-vscode-fg tracking-wide">
                  Plans & Upgrades — Coming Soon
                </h2>
                <p className="text-xs text-vscode-muted mt-1.5 max-w-sm mx-auto">
                  We're building something worth waiting for. Team collaboration, cloud-hosted
                  orchestrator scans, and AI-powered patch generation are on the way.
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-2 rounded-full border border-vscode-border bg-vscode-card px-3 py-1 text-[11px] text-severity-medium">
                <SparklesIcon size={12} />
                <span>Stay tuned for updates</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const combinedElement = (
    <>
      {modalElement}
      <ReportView
        isOpen={reportViewSessionId !== null}
        report={reportViewData}
        isLoading={isGeneratingReport}
        onClose={handleCloseReportView}
      />
    </>
  );

  if (typeof document !== "undefined") {
    return createPortal(combinedElement, document.body);
  }
  return combinedElement;
}
