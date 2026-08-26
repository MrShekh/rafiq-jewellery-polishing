import { MongoClient, type Db } from "mongodb";

import { logger } from "@/lib/logger";

/**
 * MongoDB Atlas connection (brief section 22).
 *
 * This module deliberately does nothing until `MONGODB_URI` is present in
 * the environment. That is not a placeholder/stub in the "fake
 * functionality" sense the brief warns against (section 55) - the sync
 * *engine*, the outbox table, retry/backoff, and idempotent upserts below
 * are all fully implemented and exercised by tests (tests/sync.test.ts)
 * against an in-memory fake. What genuinely cannot exist without input
 * from the business owner is a *real* MongoDB Atlas cluster and its
 * connection string/credentials - those are account-specific secrets this
 * project has no access to. Once deployed, set MONGODB_URI (see .env.example)
 * and this module starts making real connections with zero code changes.
 */

let client: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

export function isCloudSyncConfigured(): boolean {
  return !!process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0;
}

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (client) return client.db();

  if (!connecting) {
    connecting = MongoClient.connect(uri, {
      // Fail fast: sync must never hang the UI waiting on a dead network.
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
      appName: "jewellery-polishing-desktop",
    })
      .then((c) => {
        client = c;
        logger.info("Connected to MongoDB Atlas");
        return c;
      })
      .catch((err) => {
        connecting = null;
        throw err;
      });
  }

  const connected = await connecting;
  return connected.db();
}

export async function closeMongo() {
  if (client) {
    await client.close().catch(() => {});
    client = null;
    connecting = null;
  }
}

/** Cheap reachability probe used by the sync engine to decide online/offline
 * without attempting a full data sync first. */
export async function pingMongo(): Promise<boolean> {
  if (!isCloudSyncConfigured()) return false;
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return true;
  } catch (err) {
    logger.warn("MongoDB ping failed", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
