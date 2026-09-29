import type { UserSettings } from "@whoami/types";
import { dbGet, dbPut, STORES } from "./database.js";

interface KvRow<T> {
  key: string;
  value: T;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  autoScanOnOpen: true,
  defaultLayoutDirection: "DOWN",
  defaultGraphTab: "graph",
  graphViewMode: "all",
  defaultScanMode: "local-offline",
  analysisPipelineMode: "bugs",

  // Scanner & Engine
  rules: {
    commandInjection: true,
    sqlInjection: true,
    ssrf: true,
    pathTraversal: true,
    codeInjection: true,
    secretDetection: true,
  },
  customExcludedDirs: ["tests", "test", "__tests__", "fixtures", "demo"],
  maxScannableFiles: 5000,

  // Cloud Orchestrator & API Credentials -- never hardcode real keys here:
  // this object ships inside the extension's webview bundle, so any literal
  // value here is extractable in plaintext from the shipped extension.
  // Users configure their own via Settings; nothing here is a working default.
  orchestratorUrl: "https://axiom-xjkc.onrender.com",
  operatorApiKey: "",
  adminApiKey: "",
  authorizationReference: "AUTH-VSCODE-2026",
  selectedAiModel: "anthropic/claude-3.5-sonnet",

  // Telemetry & Storage
  enableTelemetry: false,
  maskAbsolutePaths: true,
  maxScanHistory: 100,
};

export async function getPreference<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const row = await dbGet<KvRow<T>>(STORES.KV_STORE, key);
    return row ? row.value : defaultValue;
  } catch (err) {
    console.warn(`[WhoAmI DB] Error reading preference ${key}:`, err);
    return defaultValue;
  }
}

export async function setPreference<T>(key: string, value: T): Promise<void> {
  try {
    await dbPut<KvRow<T>>(STORES.KV_STORE, {
      key,
      value,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn(`[WhoAmI DB] Error writing preference ${key}:`, err);
  }
}

export async function getSettings(): Promise<UserSettings> {
  const stored = await getPreference<Partial<UserSettings>>("app_settings", {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    rules: {
      ...DEFAULT_SETTINGS.rules,
      ...(stored.rules || {}),
    },
    customExcludedDirs: stored.customExcludedDirs || DEFAULT_SETTINGS.customExcludedDirs,
  };
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const updated: UserSettings = {
    ...current,
    ...patch,
    rules: {
      ...current.rules,
      ...(patch.rules || {}),
    },
  };
  await setPreference("app_settings", updated);
  return updated;
}
