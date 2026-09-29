import { DEFAULT_ORCHESTRATOR_URL } from "./constants.js";

/**
 * Hosted orchestrator origins the desktop app may call. Keep in sync with the
 * `http:default` allow list in apps/desktop-app/src-tauri/capabilities/default.json:
 * that scope is compiled into the app, so a URL accepted here but missing
 * there fails at request time with a plugin scope error.
 */
export const ORCHESTRATOR_ORIGIN_ALLOWLIST: readonly string[] = [
  new URL(DEFAULT_ORCHESTRATOR_URL).origin,
];

/** Local backend development: plain http is allowed only on loopback, any port. */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export type OrchestratorUrlValidation =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Checks a user- or build-supplied orchestrator base URL against the
 * allowlist. Operator/admin API keys are sent to whatever this returns, so
 * anything off the list is rejected rather than trusted.
 */
export function validateOrchestratorUrl(raw: string): OrchestratorUrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, reason: `"${raw}" is not a valid URL.` };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "The orchestrator URL must not contain credentials." };
  }

  const isLoopback = LOOPBACK_HOSTNAMES.has(parsed.hostname);
  if (parsed.protocol === "http:" && !isLoopback) {
    return {
      ok: false,
      reason: "The orchestrator URL must use https (plain http is allowed only for localhost).",
    };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "The orchestrator URL must use https." };
  }

  if (!isLoopback && !ORCHESTRATOR_ORIGIN_ALLOWLIST.includes(parsed.origin)) {
    return {
      ok: false,
      reason:
        `${parsed.origin} is not an allowed orchestrator host. ` +
        `Allowed: ${ORCHESTRATOR_ORIGIN_ALLOWLIST.join(", ")}, or http://localhost / http://127.0.0.1 on any port.`,
    };
  }

  const url = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  return { ok: true, url };
}

/**
 * Picks the orchestrator base URL, first match wins:
 * 1. the user's saved setting, unless empty or equal to the default (older
 *    builds saved the default itself, which would otherwise pin those
 *    installs to it forever -- see docs/plans/desktop-backend-connection.md);
 * 2. a build-time override (e.g. VITE_ORCHESTRATOR_URL);
 * 3. DEFAULT_ORCHESTRATOR_URL.
 * The chosen value is validated; an invalid one is returned as an error, not
 * silently replaced, so the user learns their setting is being ignored.
 */
export function resolveOrchestratorUrl(sources: {
  readonly userSetting?: string | null;
  readonly buildTime?: string | null;
}): OrchestratorUrlValidation {
  const user = sources.userSetting?.trim();
  const candidate =
    (user && user.replace(/\/+$/, "") !== DEFAULT_ORCHESTRATOR_URL ? user : undefined) ||
    sources.buildTime?.trim() ||
    DEFAULT_ORCHESTRATOR_URL;
  return validateOrchestratorUrl(candidate);
}
