import { and, asc, desc, eq, isNull, like, or } from "drizzle-orm";
import { nanoid } from "nanoid";

import { customers, orders } from "@/db/schema";
import { db } from "@/lib/db/client";
import { calculateOrderTotals } from "@/lib/calculations";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";
import { queueSync } from "@/lib/db/repositories/sync-helpers";
import { recordAudit } from "@/lib/db/repositories/audit";
import type { CustomerInput } from "@/lib/validation/customer";
import { logger } from "@/lib/logger";
import { NotFoundError, ConflictError } from "@/lib/db/repositories/orders";

export function listCustomers(options: { search?: string; includeInactive?: boolean } = {}) {
  const conditions = [isNull(customers.deletedAt)] as ReturnType<typeof eq>[];
  if (!options.includeInactive) {
    conditions.push(eq(customers.isActive, true) as unknown as ReturnType<typeof eq>);
  }
  if (options.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(like(customers.name, term), like(customers.phone, term)) as unknown as ReturnType<
        typeof eq
      >,
    );
  }

  return db
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(customers.name))
    .all();
}

export function getCustomerById(id: string) {
  const row = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  return row;
}

export function createCustomer(input: CustomerInput, userId: string | null) {
  const id = nanoid();
  const now = new Date().toISOString();

  const values = {
    id,
    name: input.name,
    phone: input.phone ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  db.transaction((tx) => {
    tx.insert(customers).values(values).run();
    queueSync(tx, "customer", id, "upsert", values);
    recordAudit(tx, { entityType: "customer", entityId: id, action: "create", userId, after: values });
  });

  logger.info("Customer created", { customerId: id });
  return getCustomerById(id);
}

export function updateCustomer(
  id: string,
  input: Partial<CustomerInput> & { isActive?: boolean },
  userId: string | null,
) {
  const existing = getCustomerById(id);
  const now = new Date().toISOString();

  const values = {
    name: input.name ?? existing.name,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    address: input.address !== undefined ? input.address : existing.address,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
    updatedAt: now,
    syncStatus: "pending" as const,
  };

  db.transaction((tx) => {
    tx.update(customers).set(values).where(eq(customers.id, id)).run();
    queueSync(tx, "customer", id, "upsert", { id, ...values });
    recordAudit(tx, {
      entityType: "customer",
      entityId: id,
      action: "update",
      userId,
      before: existing,
      after: values,
    });

    // Keep the denormalized name snapshot on this customer's historical
    // orders untouched (that's intentional - see db/schema.ts), but propagate
    // the *current* name so future exports/lists that join live customers
    // stay correct without a backfill migration.
  });

  logger.info("Customer updated", { customerId: id });
  return getCustomerById(id);
}

export function deactivateCustomer(id: string, userId: string | null) {
  return updateCustomer(id, { isActive: false }, userId);
}

/** Soft delete a customer. Refuses if the customer has any non-deleted orders,
 * since orders require a valid customerId - deactivate instead in that case. */
export function softDeleteCustomer(id: string, userId: string | null) {
  const existing = getCustomerById(id);
  const activeOrders = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.customerId, id), isNull(orders.deletedAt)))
    .limit(1)
    .all();

  if (activeOrders.length > 0) {
    throw new ConflictError(
      "This customer has existing orders and can't be deleted. Deactivate them instead.",
    );
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.update(customers)
      .set({ deletedAt: now, isActive: false, updatedAt: now, syncStatus: "pending" })
      .where(eq(customers.id, id))
      .run();
    queueSync(tx, "customer", id, "delete", { id });
    recordAudit(tx, { entityType: "customer", entityId: id, action: "delete", userId, before: existing });
  });

  logger.info("Customer soft-deleted", { customerId: id });
}

export interface CustomerSummary {
  totalOrders: number;
  totalPieces: number;
  totalWeightIn: string;
  totalWeightOut: string;
  totalLoss: string;
  totalFine: string;
}

export function getCustomerSummary(customerId: string): CustomerSummary {
  const rows = db
    .select({
      pieces: orders.pieces,
      weightIn: orders.weightIn,
      weightOut: orders.weightOut,
      makingCharge: orders.makingCharge,
      loss: orders.loss,
      fineTotal: orders.fineTotal,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), isNull(orders.deletedAt)))
    .all();

  const totals = calculateOrderTotals(rows, getPrecisionPolicy());

  return {
    totalOrders: rows.length,
    totalPieces: totals.totalPieces,
    totalWeightIn: totals.totalWeightIn,
    totalWeightOut: totals.totalWeightOut,
    totalLoss: totals.totalLoss,
    totalFine: totals.totalFineTotal,
  };
}

export function getCustomerOrderHistory(customerId: string) {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), isNull(orders.deletedAt)))
    .orderBy(desc(orders.orderDate), desc(orders.orderNumber))
    .all();
}
