import type { UserAccount } from "@whoami/types";
import { getPreference, setPreference } from "./preferencesRepo.js";

const DEFAULT_ACCOUNT: UserAccount = {
  name: "Local Developer",
  email: "developer@local.workspace",
  tier: "community",
  apiKey: "",
  openRouterApiKey: "",
  customGatewayUrl: "",
};

const ACCOUNT_KEY = "user_account";

export async function getAccount(): Promise<UserAccount> {
  return getPreference<UserAccount>(ACCOUNT_KEY, DEFAULT_ACCOUNT);
}

export async function saveAccount(patch: Partial<UserAccount>): Promise<UserAccount> {
  const current = await getAccount();
  const updated: UserAccount = { ...current, ...patch };
  await setPreference(ACCOUNT_KEY, updated);
  return updated;
}

