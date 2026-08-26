import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Schema notes
 * ------------
 * - Primary keys are client-generated text IDs (nanoid), never autoincrement
 *   row numbers. This is what lets the sync engine treat a SQLite row and
 *   its MongoDB document as the same record without a translation table,
 *   and makes sync idempotent (section 17 / 24 of the brief).
 * - All weight/currency-shaped values (weightIn, weightOut, makingCharge,
 *   loss, touch, fineTotal) are stored as TEXT, not REAL. SQLite's only
 *   numeric storage is IEEE754 float, which is exactly the
 *   0.1 + 0.2 = 0.30000000000000004 problem the brief calls out. Every
 *   read/write of these columns goes through lib/calculations (Decimal.js)
 *   so the database never has to do float math on jewellery weights.
 * - Every syncable table (customers, orders) carries its own sync metadata
 *   columns (syncStatus/lastSyncedAt/syncAttempts/lastSyncError) for fast
 *   "how many records are pending?" reads on the Settings page, *and* rows
 *   are additionally queued in sync_queue as a transactional outbox - see
 *   lib/sync/engine.ts for why both exist.
 * - Soft deletes: `deletedAt` is set instead of removing the row (section 15).
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "staff"] })
    .notNull()
    .default("admin"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (table) => ({
  usernameIdx: uniqueIndex("users_username_idx").on(table.username),
}));

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

  syncStatus: text("sync_status", { enum: ["pending", "synced", "failed"] })
    .notNull()
    .default("pending"),
  lastSyncedAt: text("last_synced_at"),
  syncAttempts: integer("sync_attempts").notNull().default(0),
  lastSyncError: text("last_sync_error"),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  deletedAt: text("deleted_at"),
}, (table) => ({
  nameIdx: index("customers_name_idx").on(table.name),
  deletedAtIdx: index("customers_deleted_at_idx").on(table.deletedAt),
  syncStatusIdx: index("customers_sync_status_idx").on(table.syncStatus),
}));

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull(),

  orderDate: text("order_date").notNull(), // YYYY-MM-DD
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  // Denormalized for fast table rendering / export without a join, and so
  // history is preserved even if the customer is later renamed.
  customerNameSnapshot: text("customer_name_snapshot").notNull(),

  item: text("item").notNull(),
  pieces: integer("pieces").notNull(),

  weightIn: text("weight_in").notNull(),
  weightOut: text("weight_out").notNull(),
  makingCharge: text("making_charge").notNull(),
  loss: text("loss").notNull(),
  touch: text("touch").notNull(),
  fineTotal: text("fine_total").notNull(),

  weightIn2: text("weight_in_2"),
  weightOut2: text("weight_out_2"),

  // Set true when the user explicitly confirmed a Weight Out > Weight In
  // entry (section 10) so the row doesn't keep re-triggering the warning.
  weightExceedsConfirmed: integer("weight_exceeds_confirmed", { mode: "boolean" })
    .notNull()
    .default(false),

  notes: text("notes"),

  syncStatus: text("sync_status", { enum: ["pending", "synced", "failed"] })
    .notNull()
    .default("pending"),
  lastSyncedAt: text("last_synced_at"),
  syncAttempts: integer("sync_attempts").notNull().default(0),
  lastSyncError: text("last_sync_error"),

  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  deletedAt: text("deleted_at"),
}, (table) => ({
  orderNumberIdx: uniqueIndex("orders_order_number_idx").on(table.orderNumber),
  orderDateIdx: index("orders_order_date_idx").on(table.orderDate),
  customerIdIdx: index("orders_customer_id_idx").on(table.customerId),
  deletedAtIdx: index("orders_deleted_at_idx").on(table.deletedAt),
  syncStatusIdx: index("orders_sync_status_idx").on(table.syncStatus),
}));

/** Transactional outbox: one row per pending change to push to MongoDB. */
export const syncQueue = sqliteTable("sync_queue", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["customer", "order"] }).notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
  // Full snapshot of the row at queue time, so sync doesn't need to re-read
  // (and risk racing) live application state.
  payload: text("payload").notNull(),

  status: text("status", { enum: ["pending", "in_progress", "synced", "failed"] })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  /** Exponential-backoff gate: this row is skipped by the sync engine until now >= nextAttemptAt. */
  nextAttemptAt: text("next_attempt_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (table) => ({
  statusIdx: index("sync_queue_status_idx").on(table.status),
  entityIdx: index("sync_queue_entity_idx").on(table.entityType, table.entityId),
}));

/** Singleton-ish key/value table describing the overall sync run state. */
export const syncMetadata = sqliteTable("sync_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/** Flexible app/business settings store (business profile, precision policy,
 * calculation formula version, appearance, etc). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  userId: text("user_id"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  message: text("message"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
}, (table) => ({
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type SyncQueueItem = typeof syncQueue.$inferSelect;
export type NewSyncQueueItem = typeof syncQueue.$inferInsert;
