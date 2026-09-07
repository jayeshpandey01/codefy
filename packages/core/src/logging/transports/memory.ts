import type { ILogTransport, LogEvent } from "@whoami/types";

export class MemoryTransport implements ILogTransport {
  public readonly name = "memory";
  public events: LogEvent[] = [];
  private maxCapacity: number;

  constructor(maxCapacity = 1000) {
    this.maxCapacity = maxCapacity;
  }

  send(events: LogEvent[]): void {
    this.events.push(...events);
    if (this.events.length > this.maxCapacity) {
      this.events = this.events.slice(this.events.length - this.maxCapacity);
    }
  }

  flush(): void {
    // Memory transport writes directly to array
  }

  getEvents(): LogEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  find(predicate: (event: LogEvent) => boolean): LogEvent | undefined {
    return this.events.find(predicate);
  }

  filter(predicate: (event: LogEvent) => boolean): LogEvent[] {
    return this.events.filter(predicate);
  }
}
