import { getMongoDb } from "@/lib/sync/mongo";
import { getTenantId, getBusinessProfile } from "@/lib/db/repositories/settings";

/**
 * Shared MongoDB read/write primitives for the sync system. Both the
 * in-process engine (lib/sync/engine.ts, used by the automatic background
 * sync) and the HTTP endpoints (app/api/sync/push, app/api/sync/pull, used
 * for direct/manual/future-client sync) call these same functions, so there
 * is exactly one place that knows how a customer/order document is shaped
 * in Mongo and how tenant scoping is enforced - not two implementations
 * that can drift apart.
 */

export type CloudDoc = { _id: string } & Record<string, unknown>;
export type SyncEntityType = "customer" | "order";

function collectionName(entityType: SyncEntityType): "orders" | "customers" {
  return entityType === "order" ? "orders" : "customers";
}

/** Upsert one record into its Mongo collection, stamped with the current
 * tenant. Keyed by our own client-generated id, so retries/re-runs are
 * idempotent (never produce a duplicate document). */
export async function pushRecord(
  entityType: SyncEntityType,
  entityId: string,
  doc: Record<string, unknown>,
): Promise<void> {
  const database = await getMongoDb();
  const collection = database.collection<CloudDoc>(collectionName(entityType));
  const tenantId = getTenantId();
  const businessName = getBusinessProfile().name || "Unknown Business";
  await collection.updateOne(
    { _id: entityId },
    { $set: { ...doc, _id: entityId, tenantId, businessName } },
    { upsert: true },
  );
}

/** Soft-delete mirror on the cloud side (a real removal, so a future
 * "restore"/audit on the cloud is still possible). */
export async function pushDelete(entityType: SyncEntityType, entityId: string): Promise<void> {
  const database = await getMongoDb();
  const collection = database.collection<CloudDoc>(collectionName(entityType));
  const tenantId = getTenantId();
  const businessName = getBusinessProfile().name || "Unknown Business";
  await collection.updateOne(
    { _id: entityId },
    { $set: { _id: entityId, tenantId, businessName, deletedAt: new Date().toISOString() } },
    { upsert: true },
  );
}

export interface PulledChanges {
  customers: CloudDoc[];
  orders: CloudDoc[];
}

/** Fetch every customer/order for the current tenant updated after `since`
 * (or everything, if `since` is null - the first/initial sync). Never
 * downloads other tenants' data: the tenantId filter is what enforces
 * business isolation on every pull. */
export async function pullChanges(since: string | null): Promise<PulledChanges> {
  const database = await getMongoDb();
  const tenantId = getTenantId();

  const customerQuery = since ? { tenantId, updatedAt: { $gt: since } } : { tenantId };
  const orderQuery = since ? { tenantId, updatedAt: { $gt: since } } : { tenantId };

  const [customers, orders] = await Promise.all([
    database.collection<CloudDoc>("customers").find(customerQuery).toArray(),
    database.collection<CloudDoc>("orders").find(orderQuery).toArray(),
  ]);

  return { customers, orders };
}
