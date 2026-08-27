import { and, asc, desc, eq, gte, isNull, like, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { orders, customers } from "@/db/schema";
import { db } from "@/lib/db/client";
import { calculateOrder, calculateOrderTotals, type OrderTotals } from "@/lib/calculations";
import { datePrefixForOrderNumber, formatOrderNumber } from "@/lib/ids/orderId";
import type { OrderFilter, OrderInput } from "@/lib/validation/order";
import { getFormulaVersion, getPrecisionPolicy } from "@/lib/db/repositories/settings";
import { queueSync } from "@/lib/db/repositories/sync-helpers";
import { recordAudit } from "@/lib/db/repositories/audit";
import { logger } from "@/lib/logger";

export class NotFoundError extends Error { }
export class ConflictError extends Error { }

function generateOrderNumber(orderDate: string): string {
  const date = new Date(`${orderDate}T00:00:00`);
  const prefix = datePrefixForOrderNumber(date);

  const existing = db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`))
    .all();

  let maxSeq = 0;
  for (const row of existing) {
    const seqPart = row.orderNumber.slice(prefix.length);
    const seqNum = Number(seqPart);
    if (Number.isFinite(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
  }

  return formatOrderNumber(date, maxSeq + 1);
}

function buildFilterConditions(filter: Partial<OrderFilter>) {
  const conditions = [] as ReturnType<typeof eq>[];

  if (!filter.includeDeleted) {
    conditions.push(isNull(orders.deletedAt) as unknown as ReturnType<typeof eq>);
  }
  if (filter.customerId) {
    conditions.push(eq(orders.customerId, filter.customerId));
  }
  if (filter.item) {
    conditions.push(eq(orders.item, filter.item));
  }
  if (filter.dateFrom) {
    conditions.push(gte(orders.orderDate, filter.dateFrom) as unknown as ReturnType<typeof eq>);
  }
  if (filter.dateTo) {
    conditions.push(lte(orders.orderDate, filter.dateTo) as unknown as ReturnType<typeof eq>);
  }
  if (filter.search && filter.search.trim().length > 0) {
    const term = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        like(orders.customerNameSnapshot, term),
        like(orders.item, term),
        like(orders.orderNumber, term),
      ) as unknown as ReturnType<typeof eq>,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

const SORT_COLUMN_MAP = {
  orderDate: orders.orderDate,
  customerName: orders.customerNameSnapshot,
  item: orders.item,
  pieces: orders.pieces,
  weightIn: orders.weightIn,
  weightOut: orders.weightOut,
  fineTotal: orders.fineTotal,
  createdAt: orders.createdAt,
} as const;

export function listOrders(filter: OrderFilter): {
  rows: (typeof orders.$inferSelect)[];
  total: number;
  totals: OrderTotals;
} {
  const whereClause = buildFilterConditions(filter);
  const sortColumn = SORT_COLUMN_MAP[filter.sortBy] ?? orders.orderDate;
  const orderFn = filter.sortDir === "asc" ? asc : desc;

  const countRow = db
    .select({ count: sql<number>`count(*)` })
    .from(orders)
    .where(whereClause)
    .get();
  const total = countRow?.count ?? 0;

  const rows = db
    .select()
    .from(orders)
    .where(whereClause)
    // Secondary sort by orderNumber keeps same-date rows in a stable,
    // predictable order (matches insertion order within a day).
    .orderBy(orderFn(sortColumn), desc(orders.orderNumber))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)
    .all();

  // Totals must reflect the *entire filtered set*, not just the current
  // page (section 11), so we pull only the six numeric columns for every
  // matching row - far cheaper than hydrating full rows - and sum them
  // with the same Decimal.js-backed calculation service used everywhere
  // else, never raw SQL SUM() on text-stored decimals.
  const totalsRows = db
    .select({
      pieces: orders.pieces,
      weightIn: orders.weightIn,
      weightOut: orders.weightOut,
      makingCharge: orders.makingCharge,
      loss: orders.loss,
      fineTotal: orders.fineTotal,
      weightIn2: orders.weightIn2,
      weightOut2: orders.weightOut2,
    })
    .from(orders)
    .where(whereClause)
    .all();

  const totals = calculateOrderTotals(totalsRows, getPrecisionPolicy());

  return { rows, total, totals };
}

export function getOrderById(id: string) {
  const row = db.select().from(orders).where(eq(orders.id, id)).get();
  if (!row) throw new NotFoundError(`Order ${id} not found`);
  return row;
}

export interface OrderMutationResult {
  order: typeof orders.$inferSelect;
  warnings: string[];
}

export function createOrder(input: OrderInput, userId: string | null): OrderMutationResult {
  const precision = getPrecisionPolicy();
  const formulaVersion = getFormulaVersion();

  const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
  if (!customer) throw new NotFoundError("Selected customer does not exist");

  const calc = calculateOrder({
    weightIn: input.weightIn,
    weightOut: input.weightOut,
    makingCharge: input.makingCharge,
    touch: input.touch,
    weightIn2: input.weightIn2,
    weightOut2: input.weightOut2,
    precision,
    formulaVersion,
  });

  const warnings: string[] = [];
  if (calc.isLossNegative) {
    warnings.push(
      `Loss calculated as ${calc.lossString}, which is negative. Double-check Weight In, Weight Out, and Making Charge.`,
    );
  }

  const id = nanoid();
  const now = new Date().toISOString();

  const record = db.transaction((tx) => {
    const orderNumber = generateOrderNumber(input.orderDate);

    const values = {
      id,
      orderNumber,
      orderDate: input.orderDate,
      customerId: input.customerId,
      customerNameSnapshot: customer.name,
      item: input.item,
      pieces: input.pieces,
      weightIn: Number(input.weightIn).toFixed(precision.weight),
      weightOut: Number(input.weightOut).toFixed(precision.weight),
      makingCharge: Number(input.makingCharge).toFixed(precision.weight),
      loss: calc.lossString,
      touch: Number(input.touch).toFixed(precision.touch),
      fineTotal: calc.fineTotalString,
      weightIn2: input.weightIn2 ? Number(input.weightIn2).toFixed(precision.weight) : null,
      weightOut2: input.weightOut2 ? Number(input.weightOut2).toFixed(precision.weight) : null,
      weightExceedsConfirmed: input.weightExceedsConfirmed ?? false,
      notes: input.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    tx.insert(orders).values(values).run();
    queueSync(tx, "order", id, "upsert", values);
    recordAudit(tx, {
      entityType: "order",
      entityId: id,
      action: "create",
      userId,
      after: values,
    });

    return values;
  });

  logger.info("Order created", { orderId: id, orderNumber: record.orderNumber });

  return { order: getOrderById(id), warnings };
}

export function updateOrder(
  id: string,
  input: Partial<OrderInput>,
  userId: string | null,
): OrderMutationResult {
  const precision = getPrecisionPolicy();
  const formulaVersion = getFormulaVersion();
  const existing = getOrderById(id);
  if (existing.deletedAt) throw new ConflictError("Cannot edit a deleted order");

  const merged = {
    orderDate: input.orderDate ?? existing.orderDate,
    customerId: input.customerId ?? existing.customerId,
    item: input.item ?? existing.item,
    pieces: input.pieces ?? existing.pieces,
    weightIn: input.weightIn ?? existing.weightIn,
    weightOut: input.weightOut ?? existing.weightOut,
    makingCharge: input.makingCharge ?? existing.makingCharge,
    touch: input.touch ?? existing.touch,
    weightIn2: input.weightIn2 !== undefined ? input.weightIn2 : existing.weightIn2,
    weightOut2: input.weightOut2 !== undefined ? input.weightOut2 : existing.weightOut2,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    weightExceedsConfirmed:
      input.weightExceedsConfirmed !== undefined
        ? input.weightExceedsConfirmed
        : existing.weightExceedsConfirmed,
  };

  let customerNameSnapshot = existing.customerNameSnapshot;
  if (input.customerId && input.customerId !== existing.customerId) {
    const customer = db.select().from(customers).where(eq(customers.id, input.customerId)).get();
    if (!customer) throw new NotFoundError("Selected customer does not exist");
    customerNameSnapshot = customer.name;
  }

  const calc = calculateOrder({
    weightIn: merged.weightIn,
    weightOut: merged.weightOut,
    makingCharge: merged.makingCharge,
    touch: merged.touch,
    weightIn2: merged.weightIn2,
    weightOut2: merged.weightOut2,
    precision,
    formulaVersion,
  });

  const warnings: string[] = [];
  if (calc.isLossNegative) {
    warnings.push(
      `Loss calculated as ${calc.lossString}, which is negative. Double-check Weight In, Weight Out, and Making Charge.`,
    );
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    const values = {
      orderDate: merged.orderDate,
      customerId: merged.customerId,
      customerNameSnapshot,
      item: merged.item,
      pieces: merged.pieces,
      weightIn: Number(merged.weightIn).toFixed(precision.weight),
      weightOut: Number(merged.weightOut).toFixed(precision.weight),
      makingCharge: Number(merged.makingCharge).toFixed(precision.weight),
      loss: calc.lossString,
      touch: Number(merged.touch).toFixed(precision.touch),
      fineTotal: calc.fineTotalString,
      weightIn2: merged.weightIn2 ? Number(merged.weightIn2).toFixed(precision.weight) : null,
      weightOut2: merged.weightOut2 ? Number(merged.weightOut2).toFixed(precision.weight) : null,
      weightExceedsConfirmed: merged.weightExceedsConfirmed,
      notes: merged.notes,
      updatedBy: userId,
      updatedAt: now,
      syncStatus: "pending" as const,
    };

    tx.update(orders).set(values).where(eq(orders.id, id)).run();
    queueSync(tx, "order", id, "upsert", { id, ...values });
    recordAudit(tx, {
      entityType: "order",
      entityId: id,
      action: "update",
      userId,
      before: existing,
      after: values,
    });
  });

  logger.info("Order updated", { orderId: id });

  return { order: getOrderById(id), warnings };
}

/** Soft delete (section 15): sets deletedAt rather than removing the row. */
export function softDeleteOrder(id: string, userId: string | null) {
  const existing = getOrderById(id);
  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(orders)
      .set({ deletedAt: now, updatedAt: now, updatedBy: userId, syncStatus: "pending" })
      .where(eq(orders.id, id))
      .run();
    queueSync(tx, "order", id, "delete", { id });
    recordAudit(tx, {
      entityType: "order",
      entityId: id,
      action: "delete",
      userId,
      before: existing,
    });
  });

  logger.info("Order soft-deleted", { orderId: id });
}

export function distinctItems(): string[] {
  const rows = db
    .select({ item: orders.item })
    .from(orders)
    .where(isNull(orders.deletedAt))
    .groupBy(orders.item)
    .orderBy(asc(orders.item))
    .all();
  return rows.map((r) => r.item);
}
