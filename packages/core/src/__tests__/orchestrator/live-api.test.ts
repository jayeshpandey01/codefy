import { describe, expect, it } from "vitest";
import { ScanOrchestratorClient } from "../../orchestrator/client.js";

const LIVE_BASE_URL = "https://axiom-xjkc.onrender.com";
const API_KEY = "Jf2T0sTy0IauJ6ELjLWAibC9-EpFo5LXwneztTBeyAU";
const ADMIN_API_KEY = "nBK_0V8AQVDZmC6gTpgkTn04t7Gx2IYSYiPvdT5zymU";

describe("Live API Integration with axiom-xjkc.onrender.com", () => {
  const client = new ScanOrchestratorClient({
    baseUrl: LIVE_BASE_URL,
    apiKey: API_KEY,
    adminApiKey: ADMIN_API_KEY,
  });

  it("connects to live /health endpoint", async () => {
    try {
      const health = await client.getHealth();
      expect(health).toEqual({ status: "ok" });
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error")) {
        console.warn(
          "Skipping live /health test: live API endpoint unreachable",
        );
        return;
      }
      throw err;
    }
  }, 45000);

  it("fetches live audit events using ADMIN_API_KEY", async () => {
    try {
      const events = await client.listAuditEvents();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThanOrEqual(0);
      if (events.length > 0) {
        expect(events[0]).toHaveProperty("action");
        expect(events[0]).toHaveProperty("resource_type");
      }
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error")) {
        console.warn(
          "Skipping live audit events test: live API endpoint unreachable",
        );
        return;
      }
      throw err;
    }
  }, 20000);

  it("registers a live target and triggers a recon scan job", async () => {
    try {
      const targetValue = `test-ci-${Date.now()}.example.com`;
      const target = await client.registerTarget({
        value: targetValue,
        owner_reference: "WhoAmI CI Bot <ci@whoami.dev>",
        authorization_reference: "AUTH-TEST-LIVE-001",
      });

      expect(target.id).toBeDefined();
      expect(target.value).toBe(targetValue);

      // Trigger a scan job
      const scan = await client.submitScan({
        target_id: target.id,
        profile: "recon",
      });

      expect(scan.id).toBeDefined();
      expect(scan.target_id).toBe(target.id);
      expect(scan.profile).toBe("recon");
      expect(["queued", "dispatching", "running", "completed"]).toContain(
        scan.status,
      );

      // Verify getting the scan status
      const status = await client.getScan(scan.id);
      expect(status.id).toBe(scan.id);
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error")) {
        console.warn(
          "Skipping live scan trigger test: live API endpoint unreachable",
        );
        return;
      }
      throw err;
    }
  }, 20000);

  it("fetches live SAST profiles from /v1/sast/profiles", async () => {
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
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error")) {
        console.warn(
          "Skipping live SAST profiles test: live API endpoint unreachable",
        );
        return;
      }
      throw err;
    }
  }, 20000);

  it("registers target and triggers a live SAST scan lifecycle (submit, status, cancel)", async () => {
    try {
      const targetValue = `test-sast-${Date.now()}.org`;
      const target = await client.registerTarget({
        value: targetValue,
        owner_reference: "WhoAmI SAST Test <sast@whoami.dev>",
        authorization_reference: "AUTH-TEST-SAST-001",
      });

      expect(target.id).toBeDefined();

      // Submit Joern SAST scan
      const sastScan = await client.submitSastScan({
        target_id: target.id,
        profile: "sast-joern",
        rule_tags: ["sqli", "rce"],
      });

      expect(sastScan.id).toBeDefined();
      expect(sastScan.target_id).toBe(target.id);
      expect(sastScan.profile).toBe("sast-joern");
      expect(["queued", "dispatching", "running"]).toContain(sastScan.status);

      // Verify getting SAST scan status
      const status = await client.getSastScan(sastScan.id);
      expect(status.id).toBe(sastScan.id);

      // Cancel SAST scan
      const cancelled = await client.cancelSastScan(sastScan.id);
      expect(cancelled.id).toBe(sastScan.id);
      expect(cancelled.status).toBe("cancelled");
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const errMsg = err instanceof Error ? err.message : "";
      if (errObj["statusCode"] === 0 || errMsg.includes("Network error")) {
        console.warn(
          "Skipping live SAST lifecycle test: live API endpoint unreachable",
        );
        return;
      }
      throw err;
    }
  }, 30000);
});
