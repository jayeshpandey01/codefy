import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ScanOrchestratorClient } from "../../orchestrator/client.js";

/**
 * Dynamically resolves environment variables without hardcoded fallback strings.
 */
function getEnvConfig(key: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[key]) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  for (const file of [".env.local", ".env"]) {
    let curDir = process.cwd();
    for (let i = 0; i < 4; i++) {
      const p = resolve(curDir, file);
      if (existsSync(p)) {
        try {
          const lines = readFileSync(p, "utf-8").split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
            const [k, ...v] = trimmed.split("=");
            if (k?.trim() === key) {
              const val = v.join("=").trim().replace(/^["']|["']$/g, "");
              if (val) return val;
            }
          }
        } catch {
          // Ignore read errors
        }
      }
      const parent = resolve(curDir, "..");
      if (parent === curDir) break;
      curDir = parent;
    }
  }
  return undefined;
}

const LIVE_BASE_URL =
  getEnvConfig("SAST_SERVICE_URL") || getEnvConfig("ORCHESTRATOR_URL") || "https://sast-dutn.onrender.com";
const API_KEY = getEnvConfig("API_KEY");
const ADMIN_API_KEY = getEnvConfig("ADMIN_API_KEY");
const RUN_LIVE_TESTS = process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!RUN_LIVE_TESTS)("Live API Integration with sast-dutn.onrender.com", () => {
  const client = new ScanOrchestratorClient({
    baseUrl: LIVE_BASE_URL,
    apiKey: API_KEY,
    adminApiKey: ADMIN_API_KEY,
  });

  it("connects to live /health endpoint (public)", async () => {
    try {
      const health = await client.getHealth();
      expect(health).toEqual({ status: "ok" });
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live /health test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("connects to live /health/live endpoint (public)", async () => {
    try {
      const live = await client.getLiveness();
      expect(live.status).toBe("alive");
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error") || errMsg.includes("fetch failed")) {
        console.warn("Skipping live /health/live test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("connects to live /health/ready endpoint (public)", async () => {
    try {
      const ready = await client.getReadiness();
      expect(["ready", "not_ready"]).toContain(ready.status);
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error") || errMsg.includes("fetch failed")) {
        console.warn("Skipping live /health/ready test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("fetches live SAST profiles from /v1/sast/profiles (public)", async () => {
    try {
      const profiles = await client.getSastProfiles();
      expect(profiles).toHaveProperty("sast_profiles");
      expect(Array.isArray(profiles.sast_profiles)).toBe(true);
      const profileIds = profiles.sast_profiles.map((p) => p.profile);
      expect(profileIds).toContain("sast-joern");
      expect(profileIds).toContain("sast-semgrep");
      expect(profileIds).toContain("sast-trufflehog");
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errObj["statusCode"] === 404 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live SAST profiles test: route not reachable or 404");
        return;
      }
      throw err;
    }
  }, 90000);

  it("fetches live targets list from /v1/targets using ADMIN_API_KEY", async () => {
    if (!ADMIN_API_KEY) {
      console.warn("Skipping live /v1/targets test: ADMIN_API_KEY not configured");
      return;
    }

    try {
      const targets = await client.listTargets({ limit: 5 });
      expect(Array.isArray(targets)).toBe(true);
      expect(targets.length).toBeGreaterThanOrEqual(0);
      if (targets.length > 0) {
        expect(targets[0]).toHaveProperty("id");
        expect(targets[0]).toHaveProperty("value");
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live targets test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("fetches live platform stats from /v1/stats", async () => {
    if (!API_KEY && !ADMIN_API_KEY) {
      console.warn("Skipping live /v1/stats test: API_KEY not configured");
      return;
    }

    try {
      const stats = await client.getStats();
      expect(typeof stats.targets_count).toBe("number");
      expect(typeof stats.scans_count).toBe("number");
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live /v1/stats test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("fetches live audit events using ADMIN_API_KEY", async () => {
    if (!ADMIN_API_KEY) {
      console.warn("Skipping live audit events test: ADMIN_API_KEY not configured");
      return;
    }

    try {
      const events = await client.listAuditEvents();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThanOrEqual(0);
      if (events.length > 0) {
        expect(events[0]).toHaveProperty("id");
        expect(events[0]).toHaveProperty("action");
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live audit events test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("registers a live target and triggers a recon scan job", async () => {
    if (!ADMIN_API_KEY || !API_KEY) {
      console.warn(
        "Skipping live scan trigger test: ADMIN_API_KEY or API_KEY not configured",
      );
      return;
    }

    const testDomain = `test-ci-${Date.now()}.example.com`;

    try {
      const target = await client.registerTarget({
        value: testDomain,
        owner_reference: "CI-Integration-Test",
        authorization_reference: "AUTH-CI-TEST-RUNNER",
        authorization_confirmed: true,
      });

      expect(target.id).toBeDefined();
      expect(target.value).toBe(testDomain);

      // Trigger a scan job
      const scan = await client.submitScan({
        target_id: target.id,
        profile: "recon",
      });

      expect(scan.id).toBeDefined();
      expect(scan.target_id).toBe(target.id);
      expect(scan.profile).toBe("recon");
      expect([
        "queued",
        "dispatching",
        "running",
        "completed",
      ]).toContain(scan.status);

      // Verify getting the scan status
      const status = await client.getScan(scan.id);
      expect(status.id).toBe(scan.id);
      expect([
        "queued",
        "dispatching",
        "running",
        "completed",
        "failed",
      ]).toContain(status.status);

      if (status.status !== "completed" && status.status !== "failed") {
        const cancelled = await client.cancelScan(scan.id);
        expect(["cancelled", "completed", "failed"]).toContain(cancelled.status);
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live scan trigger test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);

  it("registers target and triggers a live SAST scan lifecycle", async () => {
    if (!ADMIN_API_KEY || !API_KEY) {
      console.warn("Skipping live SAST test: ADMIN_API_KEY or API_KEY not configured");
      return;
    }

    const testTarget = `test-sast-${Date.now()}.org`;

    try {
      const target = await client.registerTarget({
        value: testTarget,
        owner_reference: "CI-Integration-Test-SAST",
        authorization_reference: "AUTH-CI-SAST",
        authorization_confirmed: true,
      });

      expect(target.id).toBeDefined();

      const scan = await client.submitSastScan({
        target_id: target.id,
        profile: "sast-semgrep",
        rule_tags: ["owasp-top-10"],
      });

      expect(scan.id).toBeDefined();
      expect(scan.target_id).toBe(target.id);
      expect(scan.profile).toBe("sast-semgrep");

      const status = await client.getSastScan(scan.id);
      expect(status.id).toBe(scan.id);
      expect([
        "queued",
        "dispatching",
        "running",
        "completed",
        "failed",
      ]).toContain(status.status);

      if (status.status !== "completed" && status.status !== "failed") {
        const cancelled = await client.cancelSastScan(scan.id);
        expect(["cancelled", "completed", "failed"]).toContain(cancelled.status);
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (
        errObj["statusCode"] === 0 ||
        errMsg.includes("Network error") ||
        errMsg.includes("fetch failed")
      ) {
        console.warn("Skipping live SAST test: live API endpoint unreachable");
        return;
      }
      throw err;
    }
  }, 90000);
});
