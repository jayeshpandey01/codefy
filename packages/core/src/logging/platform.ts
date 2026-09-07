import type { PlatformInfo } from "@whoami/types";

export const APP_VERSION = "0.1.0";

/**
 * Detect the execution runtime and host environment.
 */
export function detectPlatform(): PlatformInfo {
  let runtime: PlatformInfo["runtime"] = "node";
  let host: PlatformInfo["host"] = "standalone";
  let os: string | undefined;
  let arch: string | undefined;

  const gRecord =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as Record<string, unknown>)
      : undefined;
  const gWindow =
    gRecord && typeof gRecord["window"] === "object"
      ? (gRecord["window"] as Record<string, unknown>)
      : undefined;

  // Detect runtime
  if (gWindow && typeof gWindow["document"] !== "undefined") {
    runtime = "browser";
  } else if (gRecord && typeof gRecord["importScripts"] === "function") {
    runtime = "webworker";
  } else if (
    typeof process !== "undefined" &&
    process.versions &&
    process.versions.node
  ) {
    runtime = "node";
  }

  // Detect host
  if (typeof process !== "undefined" && process.env) {
    if (process.env["VSCODE_PID"] || process.env["VSCODE_INSPECTOR_OPTIONS"]) {
      host = "vscode";
    } else if (process.env["NODE_ENV"] === "test" || process.env["VITEST"]) {
      host = "test";
    }
  }

  if (gWindow) {
    if (gWindow["__TAURI__"] || gWindow["__TAURI_INTERNALS__"]) {
      host = "tauri";
    } else if (typeof gWindow["acquireVsCodeApi"] === "function") {
      host = "vscode";
    }
  }

  // Extract OS/arch in Node if accessible
  if (typeof process !== "undefined") {
    if (typeof process.platform === "string") {
      os = process.platform;
    }
    if (typeof process.arch === "string") {
      arch = process.arch;
    }
  }

  return {
    runtime,
    host,
    appVersion: APP_VERSION,
    os,
    arch,
  };
}
