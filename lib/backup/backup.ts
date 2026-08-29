import fs from "node:fs";
import path from "node:path";

import archiver from "archiver";

import { col } from "@/lib/db/mongo";
import { BACKUP_DIR, tempDir } from "@/lib/paths";
import { logger } from "@/lib/logger";
import { APP_VERSION } from "@/lib/version";

export interface BackupManifest {
  appVersion: string;
  createdAt: string;
}

/**
 * Creates a self-contained backup zip containing a consistent snapshot of
 * all MongoDB collections.
 */
export async function createBackupZip(destinationPath: string): Promise<BackupManifest> {
  const workDir = tempDir("jp-backup-");

  // Fetch all data from MongoDB
  const usersCol = await col("users");
  const customersCol = await col("customers");
  const ordersCol = await col("orders");
  const settingsCol = await col("settings");

  const users = await usersCol.find({}).toArray();
  const customers = await customersCol.find({}).toArray();
  const orders = await ordersCol.find({}).toArray();
  const settings = await settingsCol.find({}).toArray();

  fs.writeFileSync(path.join(workDir, "users.json"), JSON.stringify(users, null, 2), "utf8");
  fs.writeFileSync(path.join(workDir, "customers.json"), JSON.stringify(customers, null, 2), "utf8");
  fs.writeFileSync(path.join(workDir, "orders.json"), JSON.stringify(orders, null, 2), "utf8");
  fs.writeFileSync(path.join(workDir, "settings.json"), JSON.stringify(settings, null, 2), "utf8");

  const manifest: BackupManifest = {
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  await zipDirectory(workDir, destinationPath);
  fs.rmSync(workDir, { recursive: true, force: true });

  logger.info("Backup created", { destinationPath });
  return manifest;
}

/** Convenience wrapper used before a restore. */
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
