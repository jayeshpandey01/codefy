import { describe, expect, it } from "vitest";
import { DEFAULT_ORCHESTRATOR_URL } from "../../orchestrator/constants.js";
import {
  resolveOrchestratorUrl,
  validateOrchestratorUrl,
} from "../../orchestrator/url-config.js";

describe("validateOrchestratorUrl", () => {
  it("accepts the hosted default and strips a trailing slash", () => {
    expect(validateOrchestratorUrl(`${DEFAULT_ORCHESTRATOR_URL}/`)).toEqual({
      ok: true,
      url: DEFAULT_ORCHESTRATOR_URL,
    });
  });

  it("accepts plain http on loopback, any port", () => {
    expect(validateOrchestratorUrl("http://localhost:8000")).toEqual({
      ok: true,
      url: "http://localhost:8000",
    });
    expect(validateOrchestratorUrl("http://127.0.0.1:9999/api")).toEqual({
      ok: true,
      url: "http://127.0.0.1:9999/api",
    });
  });

  it.each([
    ["https host not on the allowlist", "https://evil.example.com"],
    ["plain http off loopback", "http://axiom-xjkc.onrender.com"],
    ["non-http scheme", "ftp://localhost"],
    ["embedded credentials", "https://user:pw@axiom-xjkc.onrender.com"],
    ["garbage", "not a url"],
    ["lookalike subdomain", "https://axiom-xjkc.onrender.com.evil.io"],
  ])("rejects %s", (_label, raw) => {
    expect(validateOrchestratorUrl(raw).ok).toBe(false);
  });
});

describe("resolveOrchestratorUrl", () => {
  it("prefers a user setting over build-time and default", () => {
    expect(
      resolveOrchestratorUrl({ userSetting: "http://localhost:8000", buildTime: "http://127.0.0.1:1" }),
    ).toEqual({ ok: true, url: "http://localhost:8000" });
  });

  it("treats a saved copy of the default as unset, so the build-time value applies", () => {
    expect(
      resolveOrchestratorUrl({ userSetting: `${DEFAULT_ORCHESTRATOR_URL}/`, buildTime: "http://localhost:7000" }),
    ).toEqual({ ok: true, url: "http://localhost:7000" });
  });

  it("falls back to the default when nothing is set", () => {
    expect(resolveOrchestratorUrl({ userSetting: "  ", buildTime: undefined })).toEqual({
      ok: true,
      url: DEFAULT_ORCHESTRATOR_URL,
    });
  });

  it("reports a disallowed user setting instead of silently replacing it", () => {
    const res = resolveOrchestratorUrl({ userSetting: "https://evil.example.com" });
    expect(res.ok).toBe(false);
  });
});
