import fs from "node:fs";
import path from "node:path";

import { LOG_DIR, ensureAppDirectories } from "@/lib/paths";

/**
 * Minimal, dependency-light structured logger.
 *
 * We intentionally do not import `electron-log` here: this module runs
 * inside the Next.js server process (see lib/paths.ts), which is a plain
 * Node process, not Electron's main process, so electron-log's IPC-aware
 * transports aren't the right fit. Electron's own main-process code (in
 * electron/) uses electron-log directly for its own lifecycle events
 * (update checks, window errors, etc). This logger writes newline-delimited
 * JSON to a rotating-by-day file under the app's log directory plus the
 * console, which both the Electron log viewer and any text editor can read.
 *
 * Rule #38 in the brief: never log secrets. Callers must not pass
 * passwords, tokens, or connection strings into `meta`.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function currentLogFile(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.log`);
}

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(entry);

  const consoleMethod =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleMethod(line);

  try {
    ensureAppDirectories();
    fs.appendFileSync(currentLogFile(), line + "\n", "utf8");
  } catch {
    // Logging must never crash the app. If the disk write fails we've
    // still emitted to console above.
  }
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "secret",
  "mongoUri",
  "connectionString",
  "authorization",
]);

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = SENSITIVE_KEYS.has(key) ? "[redacted]" : value;
  }
  return out;
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
