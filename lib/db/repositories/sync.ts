import { eq, sql } from "drizzle-orm";

import { syncQueue, syncMetadata } from "@/db/schema";
import { db } from "@/lib/db/client";

export function getPendingSyncCount(): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(syncQueue)
    .where(eq(syncQueue.status, "pending"))
    .get();
  return row?.count ?? 0;
}

export function getFailedSyncCount(): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(syncQueue)
    .where(eq(syncQueue.status, "failed"))
    .get();
  return row?.count ?? 0;
}

const META_KEYS = {
  lastSyncStartedAt: "sync.last_started_at",
  lastSyncCompletedAt: "sync.last_completed_at",
  lastSyncError: "sync.last_error",
} as const;

export function getSyncMeta(key: string): string | null {
  const row = db.select().from(syncMetadata).where(eq(syncMetadata.key, key)).get();
  return row?.value ?? null;
}

export function setSyncMeta(key: string, value: string) {
  db.insert(syncMetadata)
    .values({ key, value })
    .onConflictDoUpdate({
      target: syncMetadata.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run();
}

import { getTenantId } from "@/lib/db/repositories/settings";

export function getSyncStatusSnapshot() {
  return {
    pendingCount: getPendingSyncCount(),
    failedCount: getFailedSyncCount(),
    lastSyncStartedAt: getSyncMeta(META_KEYS.lastSyncStartedAt),
    lastSyncCompletedAt: getSyncMeta(META_KEYS.lastSyncCompletedAt),
    lastSyncError: getSyncMeta(META_KEYS.lastSyncError),
    tenantId: getTenantId(),
  };
}

export { META_KEYS as SYNC_META_KEYS };
