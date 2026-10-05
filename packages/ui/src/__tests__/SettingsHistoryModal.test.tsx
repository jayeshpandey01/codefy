import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ScanSessionEntry, UserAccount, UserSettings } from "@whoami/types";
import { SettingsHistoryModal } from "../components/SettingsHistoryModal.js";

const SECRET_OPENROUTER_KEY = "sk-or-v1-real-secret-do-not-leak";
const SECRET_OPERATOR_KEY = "operator-real-secret-do-not-leak";
const SECRET_ADMIN_KEY = "admin-real-secret-do-not-leak";

const TEST_ACCOUNT: UserAccount = {
  name: "Alice SecOps",
  email: "alice@security.internal",
  tier: "community",
  openRouterApiKey: SECRET_OPENROUTER_KEY,
  customGatewayUrl: "https://gateway.example.com",
};

const TEST_SETTINGS: UserSettings = {
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
  customExcludedDirs: ["tests"],
  maxScannableFiles: 5000,
  selectedAiModel: "anthropic/claude-3.5-sonnet",
  enableTelemetry: false,
  maskAbsolutePaths: true,
  maxScanHistory: 100,
};

const TEST_SESSIONS: ScanSessionEntry[] = [
  {
    id: "session-1",
    workspacePath: "/code/project-alpha",
    startedAt: 1700000000000,
    finishedAt: 1700000005000,
    mode: "local-offline",
    findingsCount: 4,
  },
  {
    id: "session-2",
    workspacePath: "/code/project-beta",
    startedAt: 1700001000000,
    finishedAt: 1700001010000,
    mode: "orchestrator",
    findingsCount: 12,
  },
];

describe("SettingsHistoryModal", () => {
  it("does not render when isOpen is false", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={false}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders Account tab by default", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Account Profile & Security")).toBeDefined();
    expect(screen.getByText("Alice SecOps")).toBeDefined();
    expect(screen.getByText("alice@security.internal")).toBeDefined();
    expect(screen.getByText("Signed in to your Codefy account.")).toBeDefined();
    expect(screen.getByRole("button", { name: /log out/i })).toBeDefined();
  });

  it("switches to Engine & Rules tab and displays rule toggles", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    const engineBtn = screen.getByRole("button", { name: /engine & rules/i });
    fireEvent.click(engineBtn);

    expect(screen.getByText("Analysis Engine & Rule Toggles")).toBeDefined();
    expect(screen.getByText(/Command Injection/i)).toBeDefined();
    expect(screen.getByText(/SQL Injection/i)).toBeDefined();
    expect(screen.getByText(/Server-Side Request Forgery/i)).toBeDefined();
    expect(screen.getByText(/Excluded Directories/i)).toBeDefined();
    expect(screen.queryByText(/Maximum Scannable Files Cap/i)).toBeNull();
  });

  it("switches to Appearance tab and displays theme settings", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    const appearanceBtn = screen.getByRole("button", { name: /appearance/i });
    fireEvent.click(appearanceBtn);

    expect(screen.getByText("Theme & Appearance")).toBeDefined();
    expect(
      screen.getByText("Choose a color theme for the editor. Changes apply instantly."),
    ).toBeDefined();
  });

  it("switches to Tips tab and displays security guidance", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    const tipsBtn = screen.getByRole("button", { name: /tips/i });
    fireEvent.click(tipsBtn);

    expect(screen.getByText("Developer Security Tips")).toBeDefined();
    expect(screen.getByText("Prevent Shell Command Injections")).toBeDefined();
    expect(screen.getByText("Use Parameterized SQL Queries")).toBeDefined();
  });

  it("switches to History tab and displays past scan sessions with filter and export", () => {
    const handleClose = vi.fn();
    const handleRestore = vi.fn();
    const handleDelete = vi.fn();

    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
        onRestoreSession={handleRestore}
        onDeleteSession={handleDelete}
      />,
    );
    const historyBtn = screen.getByRole("button", { name: /history/i });
    fireEvent.click(historyBtn);

    expect(screen.getByText("Scan History Collection")).toBeDefined();
    expect(screen.getByText("/code/project-alpha")).toBeDefined();
    expect(screen.getByText("4 finding(s)")).toBeDefined();
    expect(screen.getByText("Export JSON")).toBeDefined();

    const loadButtons = screen.getAllByRole("button", { name: /load into workbench/i });
    expect(loadButtons.length).toBe(2);

    fireEvent.click(loadButtons[0]!);
    expect(handleRestore).toHaveBeenCalledWith("session-1");
  });

  it("switches to About and Plans tabs", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    const aboutBtn = screen.getByRole("button", { name: /about/i });
    fireEvent.click(aboutBtn);
    expect(screen.getByRole("heading", { name: "About" })).toBeDefined();
    expect(screen.getByText("Codefy Security Workbench")).toBeDefined();
    expect(screen.queryByRole("heading", { name: "About WhoAmI" })).toBeNull();

    const plansBtn = screen.getByRole("button", { name: /plans/i });
    fireEvent.click(plansBtn);
    expect(screen.getByText(/coming soon/i)).toBeDefined();
  });

  it("calls onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <SettingsHistoryModal
        isOpen={true}
        onClose={handleClose}
        account={TEST_ACCOUNT}
        scanSessions={TEST_SESSIONS}
      />,
    );
    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  // Regression coverage for the data-sharing/security hardening pass: the
  // Account tab was fully gutted down to identity + Log Out (no editable
  // credential fields at all anymore), and internal backend URLs / DB names
  // must never appear in the UI.
  describe("data-sharing hardening", () => {
    it("renders no credential input fields and never leaks a secret into the DOM", () => {
      render(
        <SettingsHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          account={TEST_ACCOUNT}
          settings={TEST_SETTINGS}
          scanSessions={TEST_SESSIONS}
        />,
      );

      // None of the real secret values may appear anywhere in the document
      // -- not as an input's value, not as text content.
      expect(document.body.innerHTML).not.toContain(SECRET_OPENROUTER_KEY);
      expect(document.body.innerHTML).not.toContain(SECRET_OPERATOR_KEY);
      expect(document.body.innerHTML).not.toContain(SECRET_ADMIN_KEY);

      // The Account tab no longer exposes any credential/API key inputs at
      // all -- only identity display + Log Out.
      expect(screen.queryAllByPlaceholderText(/saved — type to replace/i).length).toBe(0);
      expect(screen.queryByLabelText(/api key/i)).toBeNull();
    });

    it("never displays the real orchestrator backend URL or local DB name", () => {
      render(
        <SettingsHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          account={TEST_ACCOUNT}
          settings={TEST_SETTINGS}
          scanSessions={TEST_SESSIONS}
        />,
      );

      expect(document.body.innerHTML).not.toContain("axiom-xjkc.onrender.com");
      expect(document.body.innerHTML).not.toContain("whoami_local_db");

      const aboutBtn = screen.getByRole("button", { name: /about/i });
      fireEvent.click(aboutBtn);
      expect(document.body.innerHTML).not.toContain("axiom-xjkc.onrender.com");
      expect(document.body.innerHTML).not.toContain("whoami_local_db");
    });

    it("invokes onLogout when Log Out is clicked", async () => {
      const handleLogout = vi.fn().mockResolvedValue(undefined);
      render(
        <SettingsHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          account={TEST_ACCOUNT}
          settings={TEST_SETTINGS}
          onLogout={handleLogout}
          scanSessions={TEST_SESSIONS}
        />,
      );

      const logoutBtn = screen.getByRole("button", { name: /log out/i });
      fireEvent.click(logoutBtn);

      expect(handleLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe("account security features", () => {
    it("displays unverified status and handles inline email verification", async () => {
      const handleVerifyEmail = vi.fn().mockResolvedValue(undefined);
      const handleResendEmail = vi.fn().mockResolvedValue(undefined);

      render(
        <SettingsHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          account={{ ...TEST_ACCOUNT, emailVerified: false }}
          scanSessions={TEST_SESSIONS}
          onVerifyEmail={handleVerifyEmail}
          onResendEmailCode={handleResendEmail}
        />,
      );

      expect(screen.getByText("Unverified")).toBeDefined();
      const verifyBtn = screen.getByRole("button", { name: /verify email/i });
      fireEvent.click(verifyBtn);

      expect(handleResendEmail).toHaveBeenCalledWith(TEST_ACCOUNT.email);
      expect(screen.getByPlaceholderText("123456")).toBeDefined();

      fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "112233" } });
      const submitCodeBtn = screen.getByRole("button", { name: /submit code/i });
      fireEvent.click(submitCodeBtn);

      expect(handleVerifyEmail).toHaveBeenCalledWith(TEST_ACCOUNT.email, "112233");
    });

    it("triggers 3-phase password reset flow", async () => {
      const handleRequestReset = vi.fn().mockResolvedValue(undefined);
      const handleVerifyOtp = vi.fn().mockResolvedValue(undefined);
      const handleResetPassword = vi.fn().mockResolvedValue(undefined);

      render(
        <SettingsHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          account={TEST_ACCOUNT}
          scanSessions={TEST_SESSIONS}
          onRequestPasswordReset={handleRequestReset}
          onVerifyResetOtp={handleVerifyOtp}
          onResetPassword={handleResetPassword}
        />,
      );

      // Phase 1: Request OTP
      const resetBtn = screen.getByRole("button", { name: /reset password/i });
      fireEvent.click(resetBtn);

      expect(screen.getByText(/Step 1: Request Password Reset Code/i)).toBeDefined();
      const sendOtpBtn = screen.getByRole("button", { name: /send 6-digit otp/i });
      fireEvent.click(sendOtpBtn);

      expect(handleRequestReset).toHaveBeenCalledWith(TEST_ACCOUNT.email);

      // Phase 2: Verify OTP
      const codeInput = await screen.findByPlaceholderText("123456");
      fireEvent.change(codeInput, { target: { value: "998877" } });
      const verifyCodeBtn = screen.getByRole("button", { name: /verify code/i });
      fireEvent.click(verifyCodeBtn);

      expect(handleVerifyOtp).toHaveBeenCalledWith(TEST_ACCOUNT.email, "998877");

      // Phase 3: Set New Password
      const newPwdInput = await screen.findByPlaceholderText(/new password \(min\. 8 characters\)/i);
      const confirmPwdInput = screen.getByPlaceholderText(/confirm new password/i);
      fireEvent.change(newPwdInput, { target: { value: "StrongPassw0rd!" } });
      fireEvent.change(confirmPwdInput, { target: { value: "StrongPassw0rd!" } });

      const commitBtn = screen.getByRole("button", { name: /commit new password/i });
      fireEvent.click(commitBtn);

      expect(handleResetPassword).toHaveBeenCalledWith({
        email: TEST_ACCOUNT.email,
        code: "998877",
        newPassword: "StrongPassw0rd!",
      });
    });

    it("lists and generates developer API keys", async () => {
      const mockKeys = [
        {
          id: "key-1",
          name: "CLI Token",
          prefix: "whoami_live_a1b2",
          createdAt: 1700000000000,
        },
      ];
      const handleListKeys = vi.fn().mockResolvedValue(mockKeys);
      const handleCreateKey = vi.fn().mockResolvedValue({
        id: "key-2",
        name: "CI Key",
        key: "whoami_live_sec_1234567890abcdef",
      });

      render(
        <SettingsHistoryModal
          isOpen={true}
          onClose={vi.fn()}
          account={TEST_ACCOUNT}
          scanSessions={TEST_SESSIONS}
          onListApiKeys={handleListKeys}
          onCreateApiKey={handleCreateKey}
        />,
      );

      expect(handleListKeys).toHaveBeenCalled();
      const existingKeyName = await screen.findByText("CLI Token");
      expect(existingKeyName).toBeDefined();

      const genKeyBtn = screen.getByRole("button", { name: /generate key/i });
      fireEvent.click(genKeyBtn);

      const nameInput = screen.getByPlaceholderText(/e\.g\. GitHub Actions Runner/i);
      fireEvent.change(nameInput, { target: { value: "CI Key" } });

      const createBtn = screen.getByRole("button", { name: /create key/i });
      fireEvent.click(createBtn);

      expect(handleCreateKey).toHaveBeenCalledWith("CI Key", 30);
      const keySecret = await screen.findByText("whoami_live_sec_1234567890abcdef");
      expect(keySecret).toBeDefined();
    });
  });
});


