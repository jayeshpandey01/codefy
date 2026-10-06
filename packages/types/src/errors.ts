import { VercelError } from "@vercel/error";

export { VercelError };

export interface StructuredErrorPayload {
  message: string;
  code?: string;
  scope?: string;
  statusCode?: number;
  reason?: string;
  hint?: string;
  fix?: string;
  link?: string;
}

function isSessionExpiredText(text: string): boolean {
  return /session.*expire|token.*invalid|invalid.*token|expired.*token|token.*revoked/i.test(text);
}

export function toStructuredError(
  error: unknown,
  fallbackScope?: string,
): StructuredErrorPayload {
  if (error instanceof VercelError) {
    const isExpired =
      error.statusCode === 401 ||
      error.code === "session_expired" ||
      isSessionExpiredText(error.message);

    return {
      message: error.message,
      code: error.code || (isExpired ? "session_expired" : undefined),
      scope: error.scope || fallbackScope,
      statusCode: error.statusCode ?? (isExpired ? 401 : undefined),
      reason:
        error.reason ||
        (isExpired
          ? "The current authentication session has expired or is invalid."
          : undefined),
      hint:
        error.hint ||
        (isExpired
          ? "Please sign in again to your Codefy account or continue offline."
          : undefined),
      fix:
        error.fix ||
        (isExpired ? "Sign in with your email and password." : undefined),
      link: error.link,
    };
  }

  if (error && typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    const message =
      typeof errObj["message"] === "string" ? errObj["message"] : String(error);
    const code =
      typeof errObj["code"] === "string" ? errObj["code"] : undefined;
    const scope =
      typeof errObj["scope"] === "string" ? errObj["scope"] : fallbackScope;
    const statusCode =
      typeof errObj["statusCode"] === "number"
        ? errObj["statusCode"]
        : undefined;
    const reason =
      typeof errObj["reason"] === "string" ? errObj["reason"] : undefined;
    const hint =
      typeof errObj["hint"] === "string" ? errObj["hint"] : undefined;
    const fix = typeof errObj["fix"] === "string" ? errObj["fix"] : undefined;
    const link =
      typeof errObj["link"] === "string" ? errObj["link"] : undefined;

    const isExpired =
      statusCode === 401 ||
      code === "session_expired" ||
      isSessionExpiredText(message);

    return {
      message,
      code: code || (isExpired ? "session_expired" : undefined),
      scope,
      statusCode: statusCode ?? (isExpired ? 401 : undefined),
      reason:
        reason ||
        (isExpired
          ? "The current authentication session has expired or is invalid."
          : undefined),
      hint:
        hint ||
        (isExpired
          ? "Please sign in again to your Codefy account or continue offline."
          : undefined),
      fix:
        fix ||
        (isExpired ? "Sign in with your email and password." : undefined),
      link,
    };
  }

  const rawMsg = typeof error === "string" ? error : String(error);
  const isExpired = isSessionExpiredText(rawMsg);
  return {
    message: rawMsg,
    scope: fallbackScope,
    code: isExpired ? "session_expired" : undefined,
    statusCode: isExpired ? 401 : undefined,
    reason: isExpired
      ? "The current authentication session has expired or is invalid."
      : undefined,
    hint: isExpired
      ? "Please sign in again to your Codefy account or continue offline."
      : undefined,
    fix: isExpired ? "Sign in with your email and password." : undefined,
  };
}
