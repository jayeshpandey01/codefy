import { describe, expect, it } from "vitest";
import { LogLevel } from "@whoami/types";
import { createAnalysisEngine } from "../../engine.js";
import { Logger } from "../../logging/logger.js";
import { MemoryTransport } from "../../logging/transports/memory.js";

const VULNERABLE_SOURCE = `
import { exec } from 'child_process';
import express from 'express';
const app = express();

app.post('/run', (req, res) => {
  const cmd = req.body.command;
  exec(cmd, (err, stdout) => {
    res.send(stdout);
  });
});
`;

describe("AnalysisEngine with Logging & Metrics Telemetry", () => {
  it("collects execution metrics and emits structured logs during scanFile", async () => {
    const memory = new MemoryTransport();
    const logger = new Logger({
      source: "app",
      logLevel: LogLevel.debug,
      transports: [memory],
    });

    const engine = createAnalysisEngine({ logger });
    const result = await engine.scanFile(
      "src/routes/run.ts",
      VULNERABLE_SOURCE,
    );

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.metrics).toBeDefined();

    const metrics = result.metrics!;
    expect(metrics.filePath).toBe("src/routes/run.ts");
    expect(metrics.language).toBe("typescript");
    expect(metrics.findingsCount).toBeGreaterThan(0);
    expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.astGrepDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.taintDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.secretScanDurationMs).toBeGreaterThanOrEqual(0);

    const events = memory.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(2);

    const startEvent = memory.find((e) =>
      e.message.includes("Starting file analysis scan"),
    );
    expect(startEvent).toBeDefined();
    expect(startEvent?.fields["filePath"]).toBe("src/routes/run.ts");

    const endEvent = memory.find((e) =>
      e.message.includes("File analysis scan completed"),
    );
    expect(endEvent).toBeDefined();
    expect(endEvent?.fields["findingsCount"]).toBe(result.findings.length);
  });
});
