import { describe, expect, it } from "vitest";
import { LogLevel } from "@whoami/types";
import { Logger } from "../../logging/logger.js";
import { MemoryTransport } from "../../logging/transports/memory.js";

describe("structured Logger", () => {
  it("respects log level filtering", () => {
    const memory = new MemoryTransport();
    const logger = new Logger({
      source: "test-source",
      logLevel: LogLevel.warn,
      transports: [memory],
    });

    logger.debug("debug message");
    logger.info("info message");
    logger.warn("warn message");
    logger.error("error message");

    const events = memory.getEvents();
    expect(events.length).toBe(2);
    expect(events[0]?.level).toBe("warn");
    expect(events[1]?.level).toBe("error");
  });

  it("inherits fields immutably with .with() and creates child loggers", () => {
    const memory = new MemoryTransport();
    const parent = new Logger({
      source: "parent",
      logLevel: LogLevel.debug,
      fields: { app: "whoami", env: "test" },
      transports: [memory],
    });

    const child = parent.with({ scanId: "scan-123" });
    const grandchild = child.child("analyzer", { file: "app.ts" });

    parent.info("parent log");
    child.info("child log");
    grandchild.info("grandchild log");

    const events = memory.getEvents();
    expect(events.length).toBe(3);

    expect(events[0]?.fields).toEqual({ app: "whoami", env: "test" });
    expect(events[0]?.source).toBe("parent");

    expect(events[1]?.fields).toEqual({
      app: "whoami",
      env: "test",
      scanId: "scan-123",
    });
    expect(events[1]?.source).toBe("parent");

    expect(events[2]?.fields).toEqual({
      app: "whoami",
      env: "test",
      scanId: "scan-123",
      file: "app.ts",
    });
    expect(events[2]?.source).toBe("analyzer");
  });

  it("automatically sanitizes sensitive tokens and passwords in logged fields", () => {
    const memory = new MemoryTransport();
    const logger = new Logger({
      source: "security-test",
      logLevel: LogLevel.info,
      transports: [memory],
      redactSensitive: true,
    });

    logger.info("User authenticated", {
      user: "admin",
      password: "SuperSecretPassword",
      apiKey: "AKIAIOSFODNN7EXAMPLE",
    });

    const events = memory.getEvents();
    expect(events[0]?.fields["password"]).toBe("[REDACTED]");
    expect(events[0]?.fields["apiKey"]).toBe("[REDACTED]");
    expect(events[0]?.fields["user"]).toBe("admin");
  });

  it("measures operation time using .time()", async () => {
    const memory = new MemoryTransport();
    const logger = new Logger({
      source: "perf-test",
      logLevel: LogLevel.debug,
      transports: [memory],
    });

    const { result, durationMs } = await logger.time(
      "ast-parsing",
      async () => {
        await new Promise((res) => setTimeout(res, 20));
        return 42;
      },
    );

    expect(result).toBe(42);
    expect(durationMs).toBeGreaterThanOrEqual(10);

    const event = memory.find((e) =>
      e.message.includes("ast-parsing completed"),
    );
    expect(event).toBeDefined();
    expect(event?.fields["operation"]).toBe("ast-parsing");
    expect(event?.fields["durationMs"]).toBeGreaterThanOrEqual(10);
  });
});
