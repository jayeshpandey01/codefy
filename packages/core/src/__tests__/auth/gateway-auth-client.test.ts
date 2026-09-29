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
});

