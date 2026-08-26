import fs from "node:fs";
import path from "node:path";

import archiver from "archiver";

import { sqlite } from "@/lib/db/client";
import { BACKUP_DIR, tempDir } from "@/lib/paths";
import { logger } from "@/lib/logger";
import { APP_VERSION } from "@/lib/version";

export interface BackupManifest {
  appVersion: string;
  createdAt: string;
  dbFileName: string;
}

/**
 * Creates a self-contained backup zip (brief section 27):
 * `JewelleryBackup_2026-08-25.zip` containing a *consistent* snapshot of
 * the SQLite database plus a manifest.
 *
 * We use better-sqlite3's native `.backup()` (SQLite's official online
 * backup API) rather than `fs.copyFile` on the live .sqlite3 file: the
 * live file is in WAL mode and may have uncommitted-to-main-file pages at
 * any instant, so a raw copy risks a torn/corrupt snapshot. `.backup()`
 * produces a proper point-in-time copy even while the app keeps running
 * and writing.
 */
export async function createBackupZip(destinationPath: string): Promise<BackupManifest> {
  const workDir = tempDir("jp-backup-");
  const dbSnapshotPath = path.join(workDir, "jewellery-polishing.sqlite3");

  await sqlite.backup(dbSnapshotPath);

  const manifest: BackupManifest = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    dbFileName: "jewellery-polishing.sqlite3",
  };
  fs.writeFileSync(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  await zipDirectory(workDir, destinationPath);
  fs.rmSync(workDir, { recursive: true, force: true });

  logger.info("Backup created", { destinationPath });
  return manifest;
}

/** Convenience wrapper used before a restore (section 28: "create an
 * automatic safety backup before restoration"). */
export async function createSafetyBackup(safetyDir: string): Promise<string> {
  fs.mkdirSync(safetyDir, { recursive: true });
  const fileName = `PreRestoreSafety_${timestampForFilename()}.zip`;
  const destPath = path.join(safetyDir, fileName);
  await createBackupZip(destPath);
  return destPath;
}

export function defaultBackupFileName(): string {
  return `JewelleryBackup_${timestampForFilename()}.zip`;
}

export function timestampForFilename(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}_${hh}${mm}`;
}

function zipDirectory(sourceDir: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export function listAvailableBackups(): { fileName: string; path: string; createdAt: string; sizeBytes: number }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      return { fileName: f, path: full, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
