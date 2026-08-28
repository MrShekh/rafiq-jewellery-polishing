import { and, eq, isNull, lte, or } from "drizzle-orm";

import { syncQueue, customers, orders } from "@/db/schema";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { getMongoDb, isCloudSyncConfigured, pingMongo } from "@/lib/sync/mongo";
import { SYNC_META_KEYS, setSyncMeta, getSyncMeta } from "@/lib/db/repositories/sync";
import { getTenantId, getBusinessProfile } from "@/lib/db/repositories/settings";

/**
 * Offline-first sync engine (brief sections 7, 23-26).
 *
 * Design: transactional outbox. Every create/update/delete in
 * lib/db/repositories/{orders,customers}.ts writes its change to
 * `sync_queue` in the *same* SQLite transaction as the business write, so
 * the two can never disagree - if the app crashes right after saving an
 * order, either both the order and its queue entry exist, or neither does.
 *
 * This module's only job is draining that queue into MongoDB Atlas:
 *   1. Skip entirely if MONGODB_URI isn't configured (offline-by-design,
 *      not an error - see lib/sync/mongo.ts).
 *   2. Probe reachability once per cycle rather than per row.
 *   3. Process rows oldest-first, each as upsert-by-client-id (never an
 *      insert), which is what makes retries and re-runs idempotent and
 *      duplicate-free (section 24: "Do not create duplicate cloud
 *      records. Use stable IDs generated on the client.").
 *   4. Conflict rule (section 25): last-valid-update-wins, keyed on the
 *      row's own `updatedAt`. Because uploads are upserts keyed by our own
 *      id and this v1 has exactly one writer (this desktop), this reduces
 *      to "whatever we last saved locally is what's in the cloud" - but
 *      the update document always includes `updatedAt`, so a future
 *      multi-device version can add a `updatedAt > $currentCloudValue`
 *      guard on the Mongo side without touching this engine's shape.
 *   5. Failures increment `attempts` and back off exponentially
 *      (capped) via `nextAttemptAt`; after MAX_ATTEMPTS the row is marked
 *      `failed` and surfaces in Settings > Sync, but is never dropped -
 *      an operator can inspect `lastError` and the sync will pick it back
 *      up if retried manually.
 */

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000; // 30s, doubling, capped at ~30min

export interface SyncTarget {
  upsert(entityType: "customer" | "order", entityId: string, doc: Record<string, unknown>): Promise<void>;
  delete(entityType: "customer" | "order", entityId: string): Promise<void>;
}

/** Real MongoDB-backed target used in production.
 *
 * We key documents by our own client-generated `_id` (a string, not
 * Mongo's default ObjectId) so upserts are keyed on the exact id
 * lib/db/schema.ts already assigned locally - that's what makes sync
 * idempotent (section 24). `Collection<{ _id: string }>` tells the driver
 * to treat `_id` as a plain string instead of inferring ObjectId. */
type SyncDoc = { _id: string } & Record<string, unknown>;

class MongoSyncTarget implements SyncTarget {
  async upsert(entityType: "customer" | "order", entityId: string, doc: Record<string, unknown>) {
    const database = await getMongoDb();
    const collection = database.collection<SyncDoc>(entityType === "order" ? "orders" : "customers");
    const tenantId = getTenantId();
    const profile = getBusinessProfile();
    const businessName = profile.name || "Unknown Business";
    await collection.updateOne(
      { _id: entityId },
      { $set: { ...doc, _id: entityId, tenantId, businessName } },
      { upsert: true },
    );
  }

  async delete(entityType: "customer" | "order", entityId: string) {
    const database = await getMongoDb();
    const collection = database.collection<SyncDoc>(entityType === "order" ? "orders" : "customers");
    const tenantId = getTenantId();
    const profile = getBusinessProfile();
    const businessName = profile.name || "Unknown Business";
    // Cloud side mirrors the soft-delete rather than a hard remove, so a
    // future "restore" or audit on the cloud side is still possible.
    await collection.updateOne(
      { _id: entityId },
      { $set: { _id: entityId, tenantId, businessName, deletedAt: new Date().toISOString() } },
      { upsert: true },
    );
  }
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, 30 * 60_000);
}

export interface SyncCycleResult {
  attempted: boolean;
  reason?: string;
  processed: number;
  succeeded: number;
  failed: number;
}

async function pullFromCloud(syncTarget: SyncTarget, lastSyncTime: string | null) {
  if (!(syncTarget instanceof MongoSyncTarget)) {
    return;
  }

  const database = await getMongoDb();
  const tenantId = getTenantId();

  // 1. Pull Customers
  const customersCollection = database.collection<SyncDoc>("customers");
  const customerQuery = lastSyncTime
    ? { tenantId, updatedAt: { $gt: lastSyncTime } }
    : { tenantId };
  const cloudCustomers = await customersCollection.find(customerQuery).toArray();

  for (const doc of cloudCustomers) {
    const local = db.select().from(customers).where(eq(customers.id, doc._id)).get();
    if (!local || new Date(doc.updatedAt as string) > new Date(local.updatedAt)) {
      const values = {
        id: doc._id,
        name: doc.name as string,
        phone: (doc.phone as string) || null,
        address: (doc.address as string) || null,
        notes: (doc.notes as string) || null,
        isActive: doc.isActive !== undefined ? Boolean(doc.isActive) : true,
        syncStatus: "synced" as const,
        lastSyncedAt: new Date().toISOString(),
        syncAttempts: 0,
        lastSyncError: null,
        createdAt: (doc.createdAt as string) || new Date().toISOString(),
        updatedAt: (doc.updatedAt as string) || new Date().toISOString(),
        deletedAt: (doc.deletedAt as string) || null,
      };

      db.transaction((tx) => {
        tx.insert(customers)
          .values(values)
          .onConflictDoUpdate({
            target: customers.id,
            set: values,
          })
          .run();
      });
    }
  }

  // 2. Pull Orders
  const ordersCollection = database.collection<SyncDoc>("orders");
  const orderQuery = lastSyncTime
    ? { tenantId, updatedAt: { $gt: lastSyncTime } }
    : { tenantId };
  const cloudOrders = await ordersCollection.find(orderQuery).toArray();

  for (const doc of cloudOrders) {
    const local = db.select().from(orders).where(eq(orders.id, doc._id)).get();
    if (!local || new Date(doc.updatedAt as string) > new Date(local.updatedAt)) {
      const values = {
        id: doc._id,
        orderNumber: doc.orderNumber as string,
        orderDate: doc.orderDate as string,
        customerId: doc.customerId as string,
        customerNameSnapshot: doc.customerNameSnapshot as string,
        item: doc.item as string,
        pieces: Number(doc.pieces),
        weightIn: String(doc.weightIn),
        weightOut: String(doc.weightOut),
        makingCharge: String(doc.makingCharge),
        loss: String(doc.loss),
        touch: String(doc.touch),
        fineTotal: String(doc.fineTotal),
        weightIn2: doc.weightIn2 ? String(doc.weightIn2) : null,
        weightOut2: doc.weightOut2 ? String(doc.weightOut2) : null,
        weightExceedsConfirmed: doc.weightExceedsConfirmed !== undefined ? Boolean(doc.weightExceedsConfirmed) : false,
        notes: (doc.notes as string) || null,
        syncStatus: "synced" as const,
        lastSyncedAt: new Date().toISOString(),
        syncAttempts: 0,
        lastSyncError: null,
        createdBy: (doc.createdBy as string) || null,
        updatedBy: (doc.updatedBy as string) || null,
        createdAt: (doc.createdAt as string) || new Date().toISOString(),
        updatedAt: (doc.updatedAt as string) || new Date().toISOString(),
        deletedAt: (doc.deletedAt as string) || null,
      };

      db.transaction((tx) => {
        tx.insert(orders)
          .values(values)
          .onConflictDoUpdate({
            target: orders.id,
            set: values,
          })
          .run();
      });
    }
  }
}

export async function runSyncCycle(target?: SyncTarget): Promise<SyncCycleResult> {
  if (!isCloudSyncConfigured()) {
    return { attempted: false, reason: "Cloud sync is not configured (MONGODB_URI unset)", processed: 0, succeeded: 0, failed: 0 };
  }

  setSyncMeta(SYNC_META_KEYS.lastSyncStartedAt, new Date().toISOString());

  const online = target ? true : await pingMongo();
  if (!online) {
    setSyncMeta(SYNC_META_KEYS.lastSyncError, "Unable to reach the cloud. Your data is saved locally and will sync automatically once the connection is restored.");
    logger.warn("Sync cycle skipped: offline");
    return { attempted: true, reason: "offline", processed: 0, succeeded: 0, failed: 0 };
  }

  const syncTarget = target ?? new MongoSyncTarget();
  const now = new Date().toISOString();

  const dueRows = db
    .select()
    .from(syncQueue)
    .where(
      and(
        eq(syncQueue.status, "pending"),
        or(isNull(syncQueue.nextAttemptAt), lte(syncQueue.nextAttemptAt, now)),
      ),
    )
    .orderBy(syncQueue.createdAt)
    .limit(BATCH_SIZE)
    .all();

  let succeeded = 0;
  let failed = 0;

  for (const row of dueRows) {
    db.update(syncQueue).set({ status: "in_progress" }).where(eq(syncQueue.id, row.id)).run();

    try {
      const payload = JSON.parse(row.payload);
      if (row.operation === "upsert") {
        await syncTarget.upsert(row.entityType, row.entityId, payload);
      } else {
        await syncTarget.delete(row.entityType, row.entityId);
      }

      db.transaction((tx) => {
        tx.update(syncQueue)
          .set({ status: "synced", lastError: null, updatedAt: new Date().toISOString() })
          .where(eq(syncQueue.id, row.id))
          .run();

        const table = row.entityType === "order" ? orders : customers;
        tx.update(table)
          .set({ syncStatus: "synced", lastSyncedAt: new Date().toISOString(), syncAttempts: 0, lastSyncError: null })
          .where(eq(table.id, row.entityId))
          .run();
      });

      succeeded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;

      db.transaction((tx) => {
        tx.update(syncQueue)
          .set({
            status: exhausted ? "failed" : "pending",
            attempts,
            lastError: message,
            nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMs(attempts)).toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(syncQueue.id, row.id))
          .run();

        const table = row.entityType === "order" ? orders : customers;
        tx.update(table)
          .set({
            syncStatus: exhausted ? "failed" : "pending",
            syncAttempts: attempts,
            lastSyncError: message,
          })
          .where(eq(table.id, row.entityId))
          .run();
      });

      logger.error("Sync row failed", { queueId: row.id, entityType: row.entityType, entityId: row.entityId, attempts, error: message });
      failed += 1;
    }
  }

  // Pull new/updated records from the cloud
  try {
    const lastSyncTime = getSyncMeta(SYNC_META_KEYS.lastSyncCompletedAt);
    await pullFromCloud(syncTarget, lastSyncTime);
  } catch (err) {
    logger.error("Failed to pull from cloud during sync cycle", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  setSyncMeta(SYNC_META_KEYS.lastSyncCompletedAt, new Date().toISOString());
  setSyncMeta(SYNC_META_KEYS.lastSyncError, failed > 0 ? `${failed} record(s) failed to sync` : "");

  logger.info("Sync cycle complete", { processed: dueRows.length, succeeded, failed });

  return { attempted: true, processed: dueRows.length, succeeded, failed };
}

let periodicHandle: ReturnType<typeof setInterval> | null = null;

/** Starts a background interval sync (brief section 26). Safe to call once
 * per server process; call stopPeriodicSync() on shutdown. */
export function startPeriodicSync(intervalMs = 60_000) {
  if (periodicHandle) return;
  periodicHandle = setInterval(() => {
    runSyncCycle().catch((err) =>
      logger.error("Periodic sync cycle threw", { error: err instanceof Error ? err.message : String(err) }),
    );
  }, intervalMs);
  // Also fire once immediately (section 26: "sync when application starts").
  runSyncCycle().catch((err) =>
    logger.error("Startup sync cycle threw", { error: err instanceof Error ? err.message : String(err) }),
  );
}

export function stopPeriodicSync() {
  if (periodicHandle) {
    clearInterval(periodicHandle);
    periodicHandle = null;
  }
}
