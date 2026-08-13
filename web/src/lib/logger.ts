type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

const sendToBackend = async (entry: LogEntry) => {
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.error("[Logger] Failed to send error to backend:", err);
  }
};

const format = (level: LogLevel, message: string, context?: Record<string, unknown>): LogEntry => ({
  level,
  message,
  timestamp: new Date().toISOString(),
  ...(context !== undefined && { context }),
});

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => {
    console.info(message, context);
    // Only send error level to backend, info/warn are local-only
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(message, context);
  },
  error: (message: string, context?: Record<string, unknown>) => {
    console.error(message, context);
    sendToBackend(format("error", message, context));
  },
};
