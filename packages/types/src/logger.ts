export enum LogLevel {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3,
  off = 100,
}

export type LogLevelName = "debug" | "info" | "warn" | "error";

export interface PlatformInfo {
  runtime: "node" | "webworker" | "browser";
  host: "vscode" | "tauri" | "standalone" | "test";
  appVersion: string;
  os?: string;
  arch?: string;
}

export interface ErrorPayload {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  scope?: string;
  reason?: string;
  hint?: string;
  fix?: string;
  link?: string;
}

export interface LogEvent {
  level: LogLevelName;
  message: string;
  fields: Record<string, unknown>;
  timestamp: string;
  source: string;
  platform: PlatformInfo;
  error?: ErrorPayload;
}

export interface ILogTransport {
  name: string;
  send(events: LogEvent[]): Promise<void> | void;
  flush?(): Promise<void> | void;
  close?(): Promise<void> | void;
}

export interface LoggerConfig {
  source?: string;
  logLevel?: LogLevel;
  fields?: Record<string, unknown>;
  transports?: ILogTransport[];
  batchSize?: number;
  flushIntervalMs?: number;
  autoFlush?: boolean;
  redactSensitive?: boolean;
}

export type FetchLike = (
  input: RequestInfo | URL | string,
  init?: RequestInit,
) => Promise<Response>;

export interface AxiomTransportConfig {
  apiToken: string;
  dataset: string;
  ingestUrl?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  fetchFn?: FetchLike;
}
