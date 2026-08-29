import { nanoid } from "nanoid";
import { col } from "@/lib/db/mongo";
import { type OrderDoc, type CustomerDoc } from "@/lib/db/types";
import { calculateOrder, calculateOrderTotals, type OrderTotals } from "@/lib/calculations";
import { datePrefixForOrderNumber, formatOrderNumber } from "@/lib/ids/orderId";
import type { OrderFilter, OrderInput } from "@/lib/validation/order";
import { getFormulaVersion, getPrecisionPolicy } from "@/lib/db/repositories/settings";
import { logger } from "@/lib/logger";

export class NotFoundError extends Error { }
export class ConflictError extends Error { }

async function generateOrderNumber(userId: string, orderDate: string): Promise<string> {
  const date = new Date(`${orderDate}T00:00:00`);
  const prefix = datePrefixForOrderNumber(date);
  const c = await col<OrderDoc>("orders");
  const existing = await c
    .find({ userId, orderNumber: { $regex: `^${prefix}` } }, { projection: { orderNumber: 1 } })
    .toArray();

  let maxSeq = 0;
  for (const row of existing) {
    const seqPart = row.orderNumber.slice(prefix.length);
    const seqNum = Number(seqPart);
    if (Number.isFinite(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
  }
  return formatOrderNumber(date, maxSeq + 1);
}

export interface OrderListResult {
  rows: OrderDoc[];
  total: number;
  totals: OrderTotals;
}

export async function listOrders(userId: string, filter: OrderFilter): Promise<OrderListResult> {
  const c = await col<OrderDoc>("orders");
  const query: Record<string, unknown> = { userId };

  if (!filter.includeDeleted) query.deletedAt = null;
  if (filter.customerId) query.customerId = filter.customerId;
  if (filter.item) query.item = filter.item;
  if (filter.dateFrom || filter.dateTo) {
    const dateQ: Record<string, string> = {};
    if (filter.dateFrom) dateQ.$gte = filter.dateFrom;
    if (filter.dateTo) dateQ.$lte = filter.dateTo;
    query.orderDate = dateQ;
  }
  if (filter.search?.trim()) {
    const re = new RegExp(filter.search.trim(), "i");
    query.$or = [{ customerNameSnapshot: re }, { item: re }, { orderNumber: re }];
  }

  const SORT_MAP: Record<string, string> = {
    orderDate: "orderDate",
    customerName: "customerNameSnapshot",
    item: "item",
    pieces: "pieces",
    weightIn: "weightIn",
    weightOut: "weightOut",
    fineTotal: "fineTotal",
    createdAt: "createdAt",
  };
  const sortField = SORT_MAP[filter.sortBy] ?? "orderDate";
  const sortDir = filter.sortDir === "asc" ? 1 : -1;

  const total = await c.countDocuments(query as any);
  const rows = await c
    .find(query as any)
    .sort({ [sortField]: sortDir, orderNumber: -1 })
    .skip((filter.page - 1) * filter.pageSize)
    .limit(filter.pageSize)
    .toArray() as OrderDoc[];

  // Totals across the full filtered set (not just the page)
  const allRows = await c
    .find(query as any, {
      projection: { pieces: 1, weightIn: 1, weightOut: 1, makingCharge: 1, loss: 1, fineTotal: 1, weightIn2: 1, weightOut2: 1 },
    })
    .toArray();

  const precision = await getPrecisionPolicy(userId);
  const totals = calculateOrderTotals(allRows as any[], precision);

  return { rows, total, totals };
}

export async function getOrderById(userId: string, id: string): Promise<OrderDoc> {
  const c = await col<OrderDoc>("orders");
  const doc = await c.findOne({ _id: id, userId });
  if (!doc) throw new NotFoundError(`Order ${id} not found`);
  return doc as OrderDoc;
}

export interface OrderMutationResult {
  order: OrderDoc;
  warnings: string[];
}

export async function createOrder(
  userId: string,
  input: OrderInput,
): Promise<OrderMutationResult> {
  const precision = await getPrecisionPolicy(userId);
  const formulaVersion = await getFormulaVersion(userId);

  const customers = await col<CustomerDoc>("customers");
  const customer = await customers.findOne({ _id: input.customerId, userId });
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
  const orderNumber = await generateOrderNumber(userId, input.orderDate);

  const doc: OrderDoc = {
    _id: id,
    userId,
    orderNumber,
    orderDate: input.orderDate,
    customerId: input.customerId,
    customerNameSnapshot: customer.name as string,
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
    deletedAt: null,
  };

  const c = await col<OrderDoc>("orders");
  await c.insertOne(doc as any);
  logger.info("Order created", { orderId: id, orderNumber });
  return { order: doc, warnings };
}

export async function updateOrder(
  userId: string,
  id: string,
  input: Partial<OrderInput>,
): Promise<OrderMutationResult> {
  const precision = await getPrecisionPolicy(userId);
  const formulaVersion = await getFormulaVersion(userId);
  const existing = await getOrderById(userId, id);
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
    weightExceedsConfirmed: input.weightExceedsConfirmed !== undefined
      ? input.weightExceedsConfirmed
      : existing.weightExceedsConfirmed,
  };

  let customerNameSnapshot = existing.customerNameSnapshot;
  if (input.customerId && input.customerId !== existing.customerId) {
    const customers = await col<CustomerDoc>("customers");
    const customer = await customers.findOne({ _id: input.customerId, userId });
    if (!customer) throw new NotFoundError("Selected customer does not exist");
    customerNameSnapshot = customer.name as string;
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
  const updates: Partial<OrderDoc> = {
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
  };

  const c = await col<OrderDoc>("orders");
  await c.updateOne({ _id: id, userId }, { $set: updates });
  logger.info("Order updated", { orderId: id });
  return { order: await getOrderById(userId, id), warnings };
}

export async function softDeleteOrder(userId: string, id: string) {
  const now = new Date().toISOString();
  const c = await col<OrderDoc>("orders");
  const result = await c.updateOne(
    { _id: id, userId },
    { $set: { deletedAt: now, updatedAt: now, updatedBy: userId } },
  );
  if (result.matchedCount === 0) throw new NotFoundError(`Order ${id} not found`);
  logger.info("Order soft-deleted", { orderId: id });
}

export async function distinctItems(userId: string): Promise<string[]> {
  const c = await col<OrderDoc>("orders");
  const items = await c.distinct("item", { userId, deletedAt: null });
  return (items as string[]).sort();
}
