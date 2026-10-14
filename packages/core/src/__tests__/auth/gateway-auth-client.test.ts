import { describe, expect, it, vi } from "vitest";
import { GatewayAuthClient } from "../../auth/gateway-auth-client.js";

describe("GatewayAuthClient", () => {
  it("forgotPassword posts to /developer/auth/forgot-password with generic response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "sent",
        message: "If an account exists with this email, a 6-digit reset code has been sent.",
      }),
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const res = await client.forgotPassword("dev@example.com");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-gateway.internal/developer/auth/forgot-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "dev@example.com", language: "en" }),
      }),
    );
    expect(res.status).toBe("sent");
    expect(res.message).toContain("6-digit reset code");
  });

  it("verifyResetOtp posts to /developer/auth/verify-reset-otp", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "verified",
        message: "OTP verified successfully.",
      }),
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const res = await client.verifyResetOtp("dev@example.com", "123456");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-gateway.internal/developer/auth/verify-reset-otp",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "dev@example.com", code: "123456" }),
      }),
    );
    expect(res.status).toBe("verified");
  });

  it("resetPassword posts to /developer/auth/reset-password with verified code and new password", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        message: "Your password has been reset successfully.",
      }),
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const res = await client.resetPassword("dev@example.com", "123456", "SecurePass123!@#");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-gateway.internal/developer/auth/reset-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "dev@example.com",
          code: "123456",
          new_password: "SecurePass123!@#",
        }),
      }),
    );
    expect(res.status).toBe("success");
  });

  it("listApiKeys retrieves keys using bearer token", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "key_1",
          key_name: "Default Key",
          prefix: "cmdd-sk-abc...",
          created_at: "2026-09-01T00:00:00Z",
          status: "active",
        },
      ],
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const keys = await client.listApiKeys("mock_bearer_token");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-gateway.internal/developer/keys",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer mock_bearer_token" },
      }),
    );
    expect(keys).toHaveLength(1);
    expect(keys[0]!.keyName).toBe("Default Key");
  });

  it("createApiKey posts new key name and returns generated credentials", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        key: "cmdd-sk-live-secret-12345",
        id: "key_2",
        name: "Test CLI Key",
      }),
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const key = await client.createApiKey("mock_bearer_token", "Test CLI Key");
    expect(key.key).toBe("cmdd-sk-live-secret-12345");
    expect(key.name).toBe("Test CLI Key");
  });

  it("revokeApiKey sends DELETE request to /developer/keys/{id}", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "revoked", key_id: "key_2" }),
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await client.revokeApiKey("mock_bearer_token", "key_2");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://mock-gateway.internal/developer/keys/key_2",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer mock_bearer_token" },
      }),
    );
  });

  it("register captures registration_token and verifyEmail forwards it", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      callCount++;
      if (url.includes("/developer/auth/register")) {
        return {
          ok: true,
          json: async () => ({
            status: "pending_verification",
            email: "pending@example.com",
            registration_token: "mock.reg.jwt.token",
          }),
        };
      }
      if (url.includes("/developer/auth/verify-email")) {
        const body = JSON.parse((init?.body as string) || "{}");
        expect(body.registration_token).toBe("mock.reg.jwt.token");
        return {
          ok: true,
          json: async () => ({
            access_token: "mock_access_jwt",
            user_id: "usr_123",
            email: "pending@example.com",
            name: "Pending User",
            tier: "community",
            expires_in_seconds: 3600,
          }),
        };
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://mock-gateway.internal",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const regResult = await client.register({
      name: "Pending User",
      email: "pending@example.com",
      password: "Password123!",
    });

    expect(regResult.status).toBe("pending_verification");
    if (regResult.status === "pending_verification") {
      expect(regResult.registrationToken).toBe("mock.reg.jwt.token");
    }

    const session = await client.verifyEmail("pending@example.com", "123456");
    expect(session.accessToken).toBe("mock_access_jwt");
    expect(callCount).toBe(2);
  });

  it("authenticates via /v1/auth/login when pointing to sast-dutn.onrender.com", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://sast-dutn.onrender.com/v1/auth/login");
      const body = JSON.parse((init?.body as string) || "{}");
      expect(body.email).toBe("user@codefy.ai");
      expect(body.password).toBe("Secret123!");
      return {
        ok: true,
        json: async () => ({
          access_token: "sast_jwt_token_123",
          token_type: "bearer",
          user_id: "usr_sast_1",
          email: "user@codefy.ai",
          name: "Security Lead",
          tier: "free",
          expires_in_seconds: 86400,
        }),
      };
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://sast-dutn.onrender.com",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const session = await client.login("user@codefy.ai", "Secret123!");
    expect(session.accessToken).toBe("sast_jwt_token_123");
    expect(session.tier).toBe("community");
    expect(session.email).toBe("user@codefy.ai");
  });

  it("verifies session via /v1/auth/me when pointing to sast-dutn.onrender.com", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://sast-dutn.onrender.com/v1/auth/me");
      expect((init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer valid_jwt");
      return {
        ok: true,
        json: async () => ({
          user_id: "usr_sast_1",
          email: "user@codefy.ai",
          name: "Security Lead",
          tier: "free",
        }),
      };
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://sast-dutn.onrender.com",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const isValid = await client.isSessionValid("valid_jwt");
    expect(isValid).toBe(true);

    const profile = await client.getProfile("valid_jwt");
    expect(profile.userId).toBe("usr_sast_1");
    expect(profile.tier).toBe("community");
  });

  it("automatically falls back to cmd-d-llm.vercel.app when sast-dutn.onrender.com returns 429", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("sast-dutn.onrender.com")) {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            detail: "Authentication failed. Please verify your credentials.",
          }),
        };
      }
      if (url.includes("cmd-d-llm.vercel.app/developer/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "vercel_jwt_fallback_token",
            token_type: "bearer",
            user_id: "usr_vercel_1",
            email: "user@codefy.ai",
            name: "Fallback Lead",
            tier: "free",
            expires_in_seconds: 86400,
          }),
        };
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const client = new GatewayAuthClient({
      baseUrl: "https://sast-dutn.onrender.com",
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const session = await client.login("user@codefy.ai", "Secret123!");
    expect(session.accessToken).toBe("vercel_jwt_fallback_token");
    expect(session.userId).toBe("usr_vercel_1");
  });
});


