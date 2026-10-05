import type { AuthSession, DeveloperApiKey, UsageSummary } from "@whoami/types";
import { DEFAULT_AI_GATEWAY_URL } from "../llm/hosted-client.js";
import { DEFAULT_AUTH_SERVICE_URL } from "../orchestrator/constants.js";

export interface GatewayAuthClientOptions {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export type RegisterResult =
  | { readonly status: "authenticated"; readonly session: AuthSession }
  | { readonly status: "pending_verification"; readonly email: string };

interface TokenResponseJson {
  readonly access_token: string;
  readonly token_type?: string;
  readonly user_id: string;
  readonly email: string;
  readonly name: string;
  readonly tier: string;
  readonly expires_in_seconds: number;
}

/** Marks an error as an already-curated, safe-to-show message (built from
 * the server's own response) -- distinguishes it from a raw network/abort
 * error, which must never reach the user verbatim (see toGenericError). */
class AuthApiError extends Error {}

function isTier(value: string): value is AuthSession["tier"] {
  return value === "community" || value === "pro" || value === "enterprise";
}

function toSession(json: TokenResponseJson): AuthSession {
  return {
    accessToken: json.access_token,
    tokenType: json.token_type || "bearer",
    userId: json.user_id,
    email: json.email,
    name: json.name,
    tier: isTier(json.tier) ? json.tier : "community",
    expiresAt: Date.now() + Math.max(0, json.expires_in_seconds) * 1000,
  };
}

/**
 * Client for the hosted AI Gateway's real developer-account system
 * (`/developer/auth/*`) -- login/registration against our own backend,
 * not a locally-invented credential store. Every method reports failures
 * generically (never the gateway's hostname/path -- see the data-sharing
 * hardening pass in `hosted-client.ts` for why backend endpoints must
 * never leak into user-facing text) while still surfacing the server's
 * own validation message about the *user's own input* (e.g. "email
 * already registered"), which is safe to show since it describes their
 * own data, not our infrastructure.
 */
export class GatewayAuthClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GatewayAuthClientOptions = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_AUTH_SERVICE_URL || DEFAULT_AI_GATEWAY_URL).replace(/\/+$/, "");
    // Generous default: a cold Render instance plus server-side email
    // dispatch on register/resend can genuinely take this long.
    this.timeoutMs = options.timeoutMs ?? 45_000;
    // Native browser `fetch` is a WebIDL operation branded to its global
    // (Window/WorkerGlobalScope) -- storing the bare reference and calling
    // it as `this.fetchImpl(...)` invokes it with the wrong receiver and
    // throws "Failed to execute 'fetch' on 'Window': Illegal invocation".
    // Node's fetch (undici) doesn't enforce this, which is why the bug
    // only surfaces when this client actually runs in a browser/webview.
    this.fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  }

  private async post(path: string, body: unknown, accessToken?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await this.parseResponse(res);
    } catch (err) {
      throw this.toGenericError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async get(path: string, accessToken: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      return await this.parseResponse(res);
    } catch (err) {
      throw this.toGenericError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async delete(path: string, accessToken: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      return await this.parseResponse(res);
    } catch (err) {
      throw this.toGenericError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseResponse(res: Response): Promise<unknown> {
    if (res.ok) {
      return res.json().catch(() => ({}));
    }
    const json = await res.json().catch(() => undefined);
    const detail =
      json && typeof json === "object" && "detail" in json
        ? this.detailToMessage((json as { detail: unknown }).detail)
        : undefined;
    if (res.status === 401 || res.status === 403) {
      throw new AuthApiError(detail || "Invalid email or password.");
    }
    if (res.status === 409) {
      throw new AuthApiError(detail || "An account with that email already exists.");
    }
    if (res.status === 422) {
      throw new AuthApiError(detail || "Please check your name, email, and password.");
    }
    throw new AuthApiError(
      detail || "The account service is temporarily unavailable. Please try again.",
    );
  }

  private detailToMessage(detail: unknown): string | undefined {
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (first && typeof first === "object" && "msg" in first) {
        return String((first as { msg: unknown }).msg);
      }
    }
    return undefined;
  }

  private toGenericError(err: unknown): Error {
    // Only an error we deliberately curated from the server's own response
    // (AuthApiError) is safe to show verbatim. Everything else -- a DOM
    // AbortError from the timeout firing, a TypeError from a network
    // failure, a CORS/DNS error -- carries no useful, safe-to-display
    // information and must collapse to one generic message rather than
    // leaking raw browser/runtime error text to the user.
    if (err instanceof AuthApiError) {
      return err;
    }
    return new Error("Couldn't reach the account service. Check your connection and try again.");
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const json = (await this.post("/developer/auth/register", input)) as
      | TokenResponseJson
      | Record<string, unknown>;
    if (json && typeof json === "object" && "access_token" in json) {
      return { status: "authenticated", session: toSession(json as TokenResponseJson) };
    }
    return { status: "pending_verification", email: input.email };
  }

  async verifyEmail(email: string, code: string): Promise<AuthSession> {
    const json = (await this.post("/developer/auth/verify-email", {
      email,
      code,
    })) as TokenResponseJson;
    return toSession(json);
  }

  async resendCode(email: string): Promise<void> {
    await this.post("/developer/auth/resend-code", { email });
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const json = (await this.post("/developer/auth/login", { email, password })) as TokenResponseJson;
    return toSession(json);
  }

  /** Validates a persisted session is still accepted server-side. Returns
   * false (never throws) on any failure -- an unreachable gateway or an
   * expired/revoked token should fall back to "please log in again", not
   * an unhandled error. */
  async isSessionValid(accessToken: string): Promise<boolean> {
    try {
      await this.get("/developer/auth/me", accessToken);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Request a 6-digit password reset OTP sent to the user's email address.
   * Matches OWASP guidelines: non-revealing generic response message to prevent
   * user enumeration attacks.
   */
  async forgotPassword(
    email: string,
    language: string = "en",
  ): Promise<{ status: string; message: string; fallback_code?: string; notice?: string }> {
    const json = (await this.post("/developer/auth/forgot-password", {
      email,
      language,
    })) as { status: string; message: string; fallback_code?: string; notice?: string };
    return json;
  }

  /**
   * Validate the 6-digit OTP code before asking the user for a new password.
   * Enforces the two-phase verification state machine.
   */
  async verifyResetOtp(email: string, code: string): Promise<{ status: string; message: string }> {
    const json = (await this.post("/developer/auth/verify-reset-otp", {
      email,
      code,
    })) as { status: string; message: string };
    return json;
  }

  /**
   * Complete password reset using verified 6-digit OTP and new password.
   * The backend validates and updates the PBKDF2-HMAC-SHA256 password hash.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ status: string; message: string }> {
    const json = (await this.post("/developer/auth/reset-password", {
      email,
      code,
      new_password: newPassword,
    })) as { status: string; message: string };
    return json;
  }

  /**
   * Retrieve active developer profile metadata (including email verification status).
   */
  async getProfile(accessToken: string): Promise<{
    user_id: string;
    email: string;
    name: string;
    tier: string;
    email_verified?: boolean;
  }> {
    const json = (await this.get("/developer/auth/me", accessToken)) as {
      user_id: string;
      email: string;
      name: string;
      tier: string;
      email_verified?: boolean;
    };
    return json;
  }

  /**
   * List all generated API keys associated with the current developer account.
   */
  async listApiKeys(accessToken: string): Promise<readonly DeveloperApiKey[]> {
    const json = (await this.get("/developer/keys", accessToken)) as Array<{
      id: string;
      key_name?: string;
      prefix?: string;
      created_at?: string;
      expires_at?: string;
      status?: "active" | "revoked";
    }>;
    if (!Array.isArray(json)) return [];
    return json.map((k) => ({
      id: k.id,
      keyName: k.key_name || "API Key",
      prefix: k.prefix || "cmdd-sk-...",
      createdAt: k.created_at || new Date().toISOString(),
      expiresAt: k.expires_at,
      status: k.status || "active",
    }));
  }

  /**
   * Generate a new developer API key with a user-specified descriptive name.
   */
  async createApiKey(
    accessToken: string,
    keyName: string,
    expiresDays?: number,
  ): Promise<{ key: string; id: string; name: string }> {
    const payload: Record<string, unknown> = { key_name: keyName };
    if (expiresDays) payload.expires_days = expiresDays;
    const json = (await this.post(
      "/developer/keys",
      payload,
      accessToken,
    )) as { key: string; id: string; name: string };
    return json;
  }

  /**
   * Revoke an active API key by its unique ID.
   */
  async revokeApiKey(accessToken: string, keyId: string): Promise<void> {
    await this.delete(`/developer/keys/${encodeURIComponent(keyId)}`, accessToken);
  }

  /**
   * Retrieve usage and rate-limit metrics for the authenticated account.
   */
  async getUsageSummary(accessToken: string): Promise<UsageSummary> {
    const json = (await this.get("/developer/usage", accessToken)) as {
      total_requests?: number;
      requests_today?: number;
      tokens_used?: number;
      cost_usd?: number;
      tier_limit_rpd?: number;
    };
    return {
      totalRequests: json?.total_requests ?? 0,
      requestsToday: json?.requests_today ?? 0,
      tokensUsed: json?.tokens_used ?? 0,
      costUsd: json?.cost_usd ?? 0,
      tierLimitRpd: json?.tier_limit_rpd ?? 100,
    };
  }
}
