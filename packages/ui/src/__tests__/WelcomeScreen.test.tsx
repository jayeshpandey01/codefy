import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WelcomeScreen } from "../components/WelcomeScreen.js";

describe("WelcomeScreen", () => {
  it("renders login form by default with 'Forgot password?' link", () => {
    const handleLogin = vi.fn();
    const handleRegister = vi.fn();
    const handleVerifyCode = vi.fn();
    const handleResendCode = vi.fn();

    render(
      <WelcomeScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerifyCode={handleVerifyCode}
        onResendCode={handleResendCode}
      />,
    );

    expect(screen.getAllByRole("button", { name: /^log in$/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Forgot password\?/i)).toBeDefined();
  });

  it("switches to forgot_password mode and requests reset code", async () => {
    const handleLogin = vi.fn();
    const handleRegister = vi.fn();
    const handleVerifyCode = vi.fn();
    const handleResendCode = vi.fn();
    const handleForgotPassword = vi.fn().mockResolvedValue({ ok: true as const });

    render(
      <WelcomeScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerifyCode={handleVerifyCode}
        onResendCode={handleResendCode}
        onForgotPassword={handleForgotPassword}
      />,
    );

    fireEvent.click(screen.getByText(/Forgot password\?/i));

    expect(screen.getByText(/Enter your email to receive a password reset code/i)).toBeDefined();
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "developer@example.com" } });

    const submitBtn = screen.getByRole("button", { name: /Send Reset Code/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleForgotPassword).toHaveBeenCalledWith("developer@example.com");
      expect(screen.getByText(/Enter the code and set your new password/i)).toBeDefined();
    });
  });

  it("completes password reset flow and returns to login", async () => {
    const handleLogin = vi.fn();
    const handleRegister = vi.fn();
    const handleVerifyCode = vi.fn();
    const handleResendCode = vi.fn();
    const handleForgotPassword = vi.fn().mockResolvedValue({ ok: true as const });
    const handleResetPassword = vi.fn().mockResolvedValue({ ok: true as const });

    render(
      <WelcomeScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerifyCode={handleVerifyCode}
        onResendCode={handleResendCode}
        onForgotPassword={handleForgotPassword}
        onResetPassword={handleResetPassword}
      />,
    );

    // Switch to forgot password
    fireEvent.click(screen.getByText(/Forgot password\?/i));
    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "alice@security.internal" } });
    fireEvent.click(screen.getByRole("button", { name: /Send Reset Code/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("123456")).toBeDefined();
    });

    // Enter code and new password
    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "654321" } });
    fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), {
      target: { value: "NewSecurePassword123!" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm new password"), {
      target: { value: "NewSecurePassword123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Reset Password & Log In/i }));

    await waitFor(() => {
      expect(handleResetPassword).toHaveBeenCalledWith({
        email: "alice@security.internal",
        code: "654321",
        newPassword: "NewSecurePassword123!",
      });
      expect(screen.getByText(/Password successfully updated! Please log in with your new password./i)).toBeDefined();
    });
  });
});
