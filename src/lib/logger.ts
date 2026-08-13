/**
 * Structured JSON logger for Cloudflare Workers / Node.js
 * Emits one JSON object per line to stdout (no console.* usage)
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogFields {
  route: string;
  method: string;
  user_id?: string;
  duration_ms?: number;
  error?: Error;
  [key: string]: unknown;
}

interface LogEntry {
  ts: string;
  level: LogLevel;
  route: string;
  method: string;
  request_id: string;
  user_id?: string;
  duration_ms?: number;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
  [key: string]: unknown;
}

function serializeError(err: Error): Exclude<LogEntry["error"], undefined> {
  return {
    name: err.name ?? "Error",
    message: err.message ?? String(err),
    stack: err.stack ?? "",
  };
}

function createLogMethod(level: LogLevel) {
  return function logMethod(fields: LogFields): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      route: fields.route,
      method: fields.method,
      request_id: crypto.randomUUID(),
    };

    if (fields.user_id !== undefined) {
      entry.user_id = fields.user_id;
    }
    if (fields.duration_ms !== undefined) {
      entry.duration_ms = fields.duration_ms;
    }
    if (fields.error instanceof Error) {
      entry.error = serializeError(fields.error);
    }

    // Copy any additional fields (e.g., message, status_code, etc.)
    for (const key of Object.keys(fields)) {
      if (
        key !== "route" &&
        key !== "method" &&
        key !== "user_id" &&
        key !== "duration_ms" &&
        key !== "error" &&
        key !== "request_id" &&
        key !== "ts" &&
        key !== "level"
      ) {
        entry[key] = fields[key];
      }
    }

    process.stdout.write(JSON.stringify(entry) + "\n");
  };
}

export const logger = {
  info: createLogMethod("info"),
  warn: createLogMethod("warn"),
  error: createLogMethod("error"),
  debug: createLogMethod("debug"),
};
