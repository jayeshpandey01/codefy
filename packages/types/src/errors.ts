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

export function toStructuredError(
  error: unknown,
  fallbackScope?: string,
): StructuredErrorPayload {
  if (error instanceof VercelError) {
    return {
      message: error.message,
      code: error.code,
      scope: error.scope || fallbackScope,
      statusCode: error.statusCode,
      reason: error.reason,
      hint: error.hint,
      fix: error.fix,
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

    return {
      message,
      code,
      scope,
      statusCode,
      reason,
      hint,
      fix,
      link,
    };
  }

  return {
    message: typeof error === "string" ? error : String(error),
    scope: fallbackScope,
  };
}
