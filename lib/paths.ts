import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolves where this app's mutable data lives: the SQLite database, logs,
 * backups, and the Electron-managed settings file.
 *
 * In production, Electron's main process spawns the Next.js server as a
 * child process and passes `USER_DATA_PATH` (== `app.getPath('userData')`,
 * e.g. `%APPDATA%/JewelleryPolishing` on Windows) down as an environment
 * variable. This is what makes the database survive application updates:
 * it lives *outside* the installation directory (see electron/main.ts and
 * requirement #50 in the project brief).
 *
 * In plain `next dev` (no Electron parent), we fall back to a `.data`
 * folder inside the repo so the app is runnable standalone during
 * development.
 */
function resolveUserDataDir(): string {
  const fromEnv = process.env.USER_DATA_PATH;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv;
  }
  return path.join(process.cwd(), ".data");
}

export const USER_DATA_DIR = resolveUserDataDir();
export const DB_DIR = path.join(USER_DATA_DIR, "db");
export const LOG_DIR = path.join(USER_DATA_DIR, "logs");
export const BACKUP_DIR = path.join(USER_DATA_DIR, "backups");
export const SAFETY_BACKUP_DIR = path.join(BACKUP_DIR, "pre-restore-safety");

export const DB_FILE_PATH = path.join(DB_DIR, "jewellery-polishing.sqlite3");

export function ensureAppDirectories() {
  for (const dir of [USER_DATA_DIR, DB_DIR, LOG_DIR, BACKUP_DIR, SAFETY_BACKUP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}
