import fs from "node:fs";
import path from "node:path";

import extractZip from "extract-zip";

import { SAFETY_BACKUP_DIR, tempDir } from "@/lib/paths";
import { createSafetyBackup, type BackupManifest } from "@/lib/backup/backup";
import { col } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";

export interface RestoreMarker {
  stagedAt: string;
  manifest: BackupManifest;
  safetyBackupPath: string;
}

/**
 * Performs a restore from a backup zip immediately into MongoDB.
 * Takes a safety backup of the current state first.
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

    // Take a safety backup of the current database first
    const safetyBackupPath = await createSafetyBackup(SAFETY_BACKUP_DIR);

    // Read the JSON files
    const usersJson = path.join(workDir, "users.json");
    const customersJson = path.join(workDir, "customers.json");
    const ordersJson = path.join(workDir, "orders.json");
    const settingsJson = path.join(workDir, "settings.json");

    const users = fs.existsSync(usersJson) ? JSON.parse(fs.readFileSync(usersJson, "utf8")) : [];
    const customers = fs.existsSync(customersJson) ? JSON.parse(fs.readFileSync(customersJson, "utf8")) : [];
    const orders = fs.existsSync(ordersJson) ? JSON.parse(fs.readFileSync(ordersJson, "utf8")) : [];
    const settings = fs.existsSync(settingsJson) ? JSON.parse(fs.readFileSync(settingsJson, "utf8")) : [];

    // Restore to MongoDB
    const usersCol = await col("users");
    const customersCol = await col("customers");
    const ordersCol = await col("orders");
    const settingsCol = await col("settings");

    // Clear existing data
    await usersCol.deleteMany({});
    await customersCol.deleteMany({});
    await ordersCol.deleteMany({});
    await settingsCol.deleteMany({});

    // Insert restored data
    if (users.length > 0) await usersCol.insertMany(users);
    if (customers.length > 0) await customersCol.insertMany(customers);
    if (orders.length > 0) await ordersCol.insertMany(orders);
    if (settings.length > 0) await settingsCol.insertMany(settings);

    const marker: RestoreMarker = {
      stagedAt: new Date().toISOString(),
      manifest,
      safetyBackupPath,
    };

    logger.info("Restore complete", { safetyBackupPath });
    return marker;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export function hasPendingRestore(): boolean {
  return false;
}
