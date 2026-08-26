import fs from "node:fs";
import path from "node:path";

import extractZip from "extract-zip";

import { USER_DATA_DIR, SAFETY_BACKUP_DIR, tempDir } from "@/lib/paths";
import { createSafetyBackup, type BackupManifest } from "@/lib/backup/backup";
import { logger } from "@/lib/logger";

export const PENDING_RESTORE_DB = path.join(USER_DATA_DIR, "pending-restore.sqlite3");
export const RESTORE_MARKER = path.join(USER_DATA_DIR, "restore-marker.json");

export interface RestoreMarker {
  stagedAt: string;
  manifest: BackupManifest;
  safetyBackupPath: string;
}

/**
 * Stages a restore from a backup zip (section 28).
 *
 * We never swap the live database file out from under the running
 * process - the Next.js server holds a long-lived, WAL-mode connection to
 * it (lib/db/client.ts), and better-sqlite3 has no safe "replace the file
 * this handle points at" operation. Instead we:
 *   1. Validate the zip actually contains a manifest + db file.
 *   2. Take a safety backup of the *current* live database first, so a
 *      bad restore is always recoverable (section 28: "Never overwrite
 *      the current database without creating a recoverable backup
 *      first").
 *   3. Copy the restored db file to a staging path and drop a marker file.
 *   4. Return `{ requiresRestart: true }` - the caller (Settings page)
 *      prompts the user to restart, and electron/main.ts checks for this
 *      marker on startup, performs the actual file swap while nothing has
 *      the database open yet, then deletes the marker and launches
 *      normally. See electron/main.ts `applyPendingRestoreIfAny()`.
 */
export async function stageRestore(zipFilePath: string): Promise<RestoreMarker> {
  const workDir = tempDir("jp-restore-");

  try {
    await extractZip(zipFilePath, { dir: workDir });

    const manifestPath = path.join(workDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("This file doesn't look like a valid backup (missing manifest.json).");
    }
    const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    const dbPath = path.join(workDir, manifest.dbFileName || "jewellery-polishing.sqlite3");
    if (!fs.existsSync(dbPath)) {
      throw new Error("This file doesn't look like a valid backup (missing database file).");
    }

    const safetyBackupPath = await createSafetyBackup(SAFETY_BACKUP_DIR);

    fs.copyFileSync(dbPath, PENDING_RESTORE_DB);

    const marker: RestoreMarker = {
      stagedAt: new Date().toISOString(),
      manifest,
      safetyBackupPath,
    };
    fs.writeFileSync(RESTORE_MARKER, JSON.stringify(marker, null, 2), "utf8");

    logger.info("Restore staged, awaiting restart", { safetyBackupPath });
    return marker;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export function hasPendingRestore(): boolean {
  return fs.existsSync(RESTORE_MARKER) && fs.existsSync(PENDING_RESTORE_DB);
}
