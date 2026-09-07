import {
  LogLevel,
  type ErrorPayload,
  type ILogTransport,
  type LogEvent,
  type LogLevelName,
  type LoggerConfig,
  type PlatformInfo,
} from "@whoami/types";
import { detectPlatform } from "./platform.js";
import { redactSensitiveData } from "./redactor.js";
import { ConsoleTransport } from "./transports/console.js";

export class Logger {
  public readonly source: string;
  public readonly logLevel: LogLevel;
  public readonly fields: Record<string, unknown>;
  public readonly redactSensitive: boolean;
  private readonly transports: ILogTransport[];
  private readonly platform: PlatformInfo;

  constructor(config: LoggerConfig = {}) {
    this.source = config.source || "whoami";
    this.logLevel = config.logLevel ?? LogLevel.info;
    this.fields = config.fields ? { ...config.fields } : {};
    this.redactSensitive = config.redactSensitive ?? true;
    this.platform = detectPlatform();

    if (config.transports && config.transports.length > 0) {
      this.transports = config.transports;
    } else {
      this.transports = [new ConsoleTransport()];
    }
  }

  /**
   * Create an immutable child logger with merged contextual fields.
   */
  with(fields: Record<string, unknown>): Logger {
    return new Logger({
      source: this.source,
      logLevel: this.logLevel,
      fields: { ...this.fields, ...fields },
      transports: this.transports,
      redactSensitive: this.redactSensitive,
    });
  }

  /**
   * Create an immutable child logger with an updated source tag.
   */
  child(source: string, fields: Record<string, unknown> = {}): Logger {
    return new Logger({
      source,
      logLevel: this.logLevel,
      fields: { ...this.fields, ...fields },
      transports: this.transports,
      redactSensitive: this.redactSensitive,
    });
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    if (this.logLevel <= LogLevel.debug) {
      this.log("debug", message, fields);
    }
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    if (this.logLevel <= LogLevel.info) {
      this.log("info", message, fields);
    }
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    if (this.logLevel <= LogLevel.warn) {
      this.log("warn", message, fields);
    }
  }

  error(
    message: string,
    errorOrFields?: Error | ErrorPayload | Record<string, unknown>,
    additionalFields?: Record<string, unknown>,
  ): void {
    if (this.logLevel <= LogLevel.error) {
      let errorPayload: ErrorPayload | undefined;
      let fields: Record<string, unknown> = {};

      if (errorOrFields instanceof Error) {
        const errObj = errorOrFields as unknown as Record<string, unknown>;
        errorPayload = {
          name: errorOrFields.name,
          message: errorOrFields.message,
          stack: errorOrFields.stack,
          code:
            typeof errObj["code"] === "string" ||
            typeof errObj["code"] === "number"
              ? errObj["code"]
              : undefined,
          scope:
            typeof errObj["scope"] === "string" ? errObj["scope"] : undefined,
          reason:
            typeof errObj["reason"] === "string" ? errObj["reason"] : undefined,
          hint: typeof errObj["hint"] === "string" ? errObj["hint"] : undefined,
          fix: typeof errObj["fix"] === "string" ? errObj["fix"] : undefined,
          link: typeof errObj["link"] === "string" ? errObj["link"] : undefined,
        };
        fields = additionalFields || {};
      } else if (errorOrFields && typeof errorOrFields === "object") {
        if ("message" in errorOrFields && "name" in errorOrFields) {
          errorPayload = errorOrFields as ErrorPayload;
          fields = additionalFields || {};
        } else {
          fields = errorOrFields as Record<string, unknown>;
        }
      }

      this.log("error", message, fields, errorPayload);
    }
  }

  /**
   * Utility to measure asynchronous execution duration and log it.
   */
  async time<T>(
    operationName: string,
    fn: () => Promise<T>,
    fields: Record<string, unknown> = {},
  ): Promise<{ result: T; durationMs: number }> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      this.debug(`[time] ${operationName} completed`, {
        ...fields,
        operation: operationName,
        durationMs,
      });
      return { result, durationMs };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      this.error(
        `[time] ${operationName} failed`,
        err instanceof Error ? err : new Error(String(err)),
        {
          ...fields,
          operation: operationName,
          durationMs,
        },
      );
      throw err;
    }
  }

  private log(
    level: LogLevelName,
    message: string,
    fields: Record<string, unknown>,
    error?: ErrorPayload,
  ): void {
    const mergedFields = { ...this.fields, ...fields };
    const sanitizedFields = this.redactSensitive
      ? redactSensitiveData(mergedFields)
      : mergedFields;
    const sanitizedError =
      error && this.redactSensitive ? redactSensitiveData(error) : error;

    const event: LogEvent = {
      level,
      message,
      fields: sanitizedFields as Record<string, unknown>,
      timestamp: new Date().toISOString(),
      source: this.source,
      platform: this.platform,
      error: sanitizedError,
    };

    for (const transport of this.transports) {
      try {
        transport.send([event]);
      } catch (err) {
        console.error(`[Logger] Transport ${transport.name} error:`, err);
      }
    }
  }

  /**
   * Flush all buffered transports.
   */
  async flush(): Promise<void> {
    const flushPromises = this.transports
      .filter((t) => typeof t.flush === "function")
      .map((t) => t.flush!());

    await Promise.allSettled(flushPromises);
  }

  /**
   * Close and teardown all transports.
   */
  async close(): Promise<void> {
    const closePromises = this.transports
      .filter((t) => typeof t.close === "function")
      .map((t) => t.close!());

    await Promise.allSettled(closePromises);
  }
}
