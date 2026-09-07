import type { ILogTransport, LogEvent } from "@whoami/types";

export interface ConsoleTransportOptions {
  enableColors?: boolean;
  prefix?: string;
}

export class ConsoleTransport implements ILogTransport {
  public readonly name = "console";
  private options: ConsoleTransportOptions;

  constructor(options: ConsoleTransportOptions = {}) {
    this.options = {
      enableColors: true,
      ...options,
    };
  }

  send(events: LogEvent[]): void {
    for (const event of events) {
      const prefix = this.options.prefix
        ? `[${this.options.prefix}]`
        : `[${event.source}]`;
      const time =
        event.timestamp.split("T")[1]?.replace("Z", "") || event.timestamp;
      const levelTag = `[${event.level.toUpperCase()}]`;
      const header = `${time} ${prefix} ${levelTag} ${event.message}`;

      const hasFields = Object.keys(event.fields).length > 0;

      switch (event.level) {
        case "debug":
          if (hasFields) {
            console.debug(header, event.fields);
          } else {
            console.debug(header);
          }
          break;
        case "info":
          if (hasFields) {
            console.info(header, event.fields);
          } else {
            console.info(header);
          }
          break;
        case "warn":
          if (hasFields) {
            console.warn(header, event.fields);
          } else {
            console.warn(header);
          }
          break;
        case "error":
          if (event.error) {
            console.error(header, event.error, hasFields ? event.fields : "");
          } else if (hasFields) {
            console.error(header, event.fields);
          } else {
            console.error(header);
          }
          break;
      }
    }
  }

  flush(): void {
    // Console is synchronous
  }
}
