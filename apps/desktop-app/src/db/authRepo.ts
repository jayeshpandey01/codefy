import type { AuthSession } from "@whoami/types";
import { getPreference, setPreference } from "./preferencesRepo.js";

const AUTH_SESSION_KEY = "auth_session";

export async function getAuthSession(): Promise<AuthSession | null> {
  return getPreference<AuthSession | null>(AUTH_SESSION_KEY, null);
}

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await setPreference<AuthSession | null>(AUTH_SESSION_KEY, session);
}

export async function clearAuthSession(): Promise<void> {
  await setPreference<AuthSession | null>(AUTH_SESSION_KEY, null);
}
