import React, { useState } from "react";
import type { ResetPasswordSubmit } from "@whoami/types";
import {
  AlertTriangleIcon,
  CheckIcon,
  CodefyLogo,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  SparklesIcon,
} from "./Icons.js";
import { ThemePicker } from "./ThemePicker.js";
import { useTheme } from "./ThemeContext.js";

export type WelcomeAuthResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export type WelcomeRegisterResult =
  | { readonly ok: true; readonly status: "authenticated" }
  | { readonly ok: true; readonly status: "pending_verification"; readonly email: string }
  | { readonly ok: false; readonly error: string };

export interface WelcomeScreenProps {
  readonly onLogin: (email: string, password: string) => Promise<WelcomeAuthResult>;
  readonly onRegister: (
    name: string,
    email: string,
    password: string,
  ) => Promise<WelcomeRegisterResult>;
  readonly onVerifyCode: (email: string, code: string) => Promise<WelcomeAuthResult>;
  readonly onResendCode: (email: string) => Promise<void>;
  readonly onForgotPassword?: (email: string) => Promise<WelcomeAuthResult>;
  readonly onResetPassword?: (req: ResetPasswordSubmit) => Promise<WelcomeAuthResult>;
  /** When provided, shows a "Continue Offline" link below the auth form. */
  readonly onContinueOffline?: () => void;
}

type Mode = "login" | "register" | "verify" | "forgot_password" | "reset_password" | "theme_pick";

const inputClass =
  "w-full rounded border border-vscode-border bg-vscode-header px-3 py-2 text-sm text-vscode-fg focus:border-vscode-focus focus:outline-none";
const labelClass = "block text-xs font-semibold text-vscode-fg mb-1";

export function WelcomeScreen({
  onLogin,
  onRegister,
  onVerifyCode,
  onResendCode,
  onForgotPassword,
  onResetPassword,
  onContinueOffline,
}: WelcomeScreenProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const { theme: currentTheme } = useTheme();

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCode("");
    setResetSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccess(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const result = await onLogin(email.trim(), password);
        if (!result.ok) setError(result.error);
      } else if (mode === "register") {
        const result = await onRegister(name.trim(), email.trim(), password);
        if (!result.ok) {
          setError(result.error);
        } else if (result.status === "pending_verification") {
          setPendingEmail(result.email);
          setCode("");
          setMode("verify");
        }
      } else if (mode === "verify") {
        const result = await onVerifyCode(pendingEmail, code.trim());
        if (!result.ok) setError(result.error);
      } else if (mode === "forgot_password") {
        if (!onForgotPassword) {
          setError("Password reset is not configured.");
          return;
        }
        const result = await onForgotPassword(email.trim());
        if (!result.ok) {
          setError(result.error);
        } else {
          setPendingEmail(email.trim());
          setCode("");
          setMode("reset_password");
        }
      } else if (mode === "reset_password") {
        if (!onResetPassword) {
          setError("Password reset is not configured.");
          return;
        }
        if (newPassword.length < 8) {
          setError("New password must be at least 8 characters long.");
          return;
        }
        if (newPassword !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const result = await onResetPassword({
          email: pendingEmail,
          code: code.trim(),
          newPassword,
        });
        if (!result.ok) {
          setError(result.error);
        } else {
          setMode("login");
          setResetSuccess("Password successfully updated! Please log in with your new password.");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setResendStatus(null);
    try {
      if (mode === "reset_password" && onForgotPassword) {
        await onForgotPassword(pendingEmail);
      } else {
        await onResendCode(pendingEmail);
      }
      setResendStatus("Code resent — check your inbox.");
    } catch {
      setResendStatus("Couldn't resend the code. Try again shortly.");
    } finally {
      setTimeout(() => setResendStatus(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-vscode-header p-4 font-sans select-none">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(600px circle at 50% 20%, rgba(0,122,204,0.15), transparent 70%)",
        }}
      />

      {/* ── THEME PICKER SCREEN ── */}
      {mode === "theme_pick" && (
        <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-4xl animate-in fade-in duration-200">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-wide">Choose an editor theme type</h1>
            <p className="text-sm text-vscode-muted mt-1">
              Click or use arrow keys (← or →) to select.
            </p>
          </div>
          <ThemePicker className="w-full" />
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-sm text-vscode-muted hover:text-white transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="flex items-center gap-1.5 rounded bg-vscode-focus hover:bg-vscode-primary-hover px-5 py-2 text-sm font-semibold text-white transition-colors cursor-pointer"
            >
              Done ↵
            </button>
          </div>
          {/* Active theme label */}
          <div className="text-xs text-vscode-muted">
            Active theme: <span className="text-severity-medium font-medium">{currentTheme}</span>
          </div>
        </div>
      )}

      {/* ── AUTH CARD ── */}
      {mode !== "theme_pick" && (
      <div className="relative w-full max-w-sm rounded-xl border border-vscode-border bg-vscode-bg p-7 shadow-2xl">
        <div className="flex flex-col items-center gap-2 mb-6">
          <CodefyLogo size={34} className="text-vscode-focus" />
          <div className="text-base font-bold tracking-wide text-white">Codefy</div>
          <div className="text-xs text-vscode-muted text-center">
            {mode === "verify"
              ? "Verify your email to finish creating your account"
              : mode === "forgot_password"
                ? "Enter your email to receive a password reset code"
                : mode === "reset_password"
                  ? "Enter the code and set your new password"
                  : "Sign in to start finding real vulnerabilities"}
          </div>
        </div>

        {(mode === "login" || mode === "register") && (
          <div className="mb-5 flex rounded-lg border border-vscode-border bg-vscode-header p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                mode === "login" ? "bg-vscode-focus text-white" : "text-vscode-muted hover:text-vscode-fg"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                mode === "register" ? "bg-vscode-focus text-white" : "text-vscode-muted hover:text-vscode-fg"
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {mode === "register" && (
            <div>
              <label className={labelClass}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={1}
                maxLength={100}
                placeholder="Ada Lovelace"
                className={inputClass}
              />
            </div>
          )}

          {(mode === "login" || mode === "register" || mode === "forgot_password") && (
            <div>
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div>
              <div className="flex items-center justify-between">
                <label className={labelClass}>Password</label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot_password")}
                    className="text-[11px] text-severity-medium hover:underline cursor-pointer mb-1"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 6 : undefined}
                placeholder={mode === "register" ? "At least 6 characters" : "••••••••"}
                className={inputClass}
              />
            </div>
          )}

          {mode === "reset_password" && (
            <>
              <div>
                <label className={labelClass}>
                  6-digit code sent to <span className="text-severity-medium">{pendingEmail}</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  minLength={6}
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="123456"
                  className={`${inputClass} text-center font-mono text-lg tracking-[0.3em]`}
                />
              </div>

              <div>
                <label className={labelClass}>New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    className={`${inputClass} pr-8`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-2.5 text-vscode-muted hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Confirm new password"
                  className={inputClass}
                />
              </div>

              <button
                type="button"
                onClick={handleResend}
                className="text-[11px] text-severity-medium hover:text-white text-left cursor-pointer"
              >
                Resend code
              </button>
              {resendStatus && (
                <div className="text-[11px] text-severity-low">{resendStatus}</div>
              )}
            </>
          )}

          {mode === "verify" && (
            <div>
              <label className={labelClass}>
                6-digit code sent to <span className="text-severity-medium">{pendingEmail}</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                minLength={6}
                maxLength={6}
                inputMode="numeric"
                placeholder="123456"
                className={`${inputClass} text-center font-mono text-lg tracking-[0.3em]`}
              />
              <button
                type="button"
                onClick={handleResend}
                className="mt-2 text-[11px] text-severity-medium hover:text-white cursor-pointer"
              >
                Resend code
              </button>
              {resendStatus && (
                <div className="mt-1 text-[11px] text-severity-low">{resendStatus}</div>
              )}
            </div>
          )}

          {resetSuccess && (
            <div className="flex items-start gap-2 rounded border border-severity-low/30 bg-severity-low/10 px-2.5 py-2 text-[11px] text-severity-low">
              <CheckIcon size={13} className="mt-0.5 shrink-0" />
              <span>{resetSuccess}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded border border-severity-critical/30 bg-severity-critical/10 px-2.5 py-2 text-[11px] text-severity-critical">
              <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex items-center justify-center gap-1.5 rounded bg-vscode-focus hover:bg-vscode-primary-hover active:bg-[#004E82] disabled:opacity-60 disabled:cursor-default px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <LockIcon size={13} />
            <span>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Log In"
                  : mode === "register"
                    ? "Create Account"
                    : mode === "verify"
                      ? "Verify & Continue"
                      : mode === "forgot_password"
                        ? "Send Reset Code"
                        : "Reset Password & Log In"}
            </span>
          </button>

          {(mode === "verify" || mode === "forgot_password" || mode === "reset_password") && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="text-[11px] text-vscode-muted hover:text-vscode-fg cursor-pointer"
            >
              ← Back to Log In
            </button>
          )}
        </form>

        {onContinueOffline && (
          <button
            type="button"
            onClick={onContinueOffline}
            className="mt-3 w-full text-center text-[11px] text-vscode-muted hover:text-severity-medium transition-colors cursor-pointer"
          >
            Continue in Offline Mode →
          </button>
        )}

        <div className="mt-6 flex items-center justify-between text-[10px] text-vscode-dim">
          <div className="flex items-center gap-1.5">
            <SparklesIcon size={11} />
            <span>Deterministic taint analysis. Zero alert fatigue.</span>
          </div>
          <button
            type="button"
            onClick={() => switchMode("theme_pick")}
            title="Choose color theme"
            className="flex items-center gap-1 text-vscode-muted hover:text-severity-medium transition-colors cursor-pointer"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
            <span>Theme</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
