import { redact } from "./redaction";
import type { SafeLogger } from "./types";

export const silentLogger: SafeLogger = Object.freeze({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
});

export class SanitizedLogger implements SafeLogger {
  constructor(private readonly sink: (entry: Readonly<Record<string, unknown>>) => void) {}
  debug(event: string, fields: Readonly<Record<string, unknown>> = {}): void { this.write("debug", event, fields); }
  info(event: string, fields: Readonly<Record<string, unknown>> = {}): void { this.write("info", event, fields); }
  warn(event: string, fields: Readonly<Record<string, unknown>> = {}): void { this.write("warn", event, fields); }
  error(event: string, fields: Readonly<Record<string, unknown>> = {}): void { this.write("error", event, fields); }
  private write(level: string, event: string, fields: Readonly<Record<string, unknown>>): void {
    this.sink(Object.freeze({ timestamp: new Date().toISOString(), level, event, fields: redact(fields) }));
  }
}

