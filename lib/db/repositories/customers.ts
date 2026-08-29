import { nanoid } from "nanoid";
import { col } from "@/lib/db/mongo";
import { type CustomerDoc, type OrderDoc } from "@/lib/db/types";
import { calculateOrderTotals } from "@/lib/calculations";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";
import { logger } from "@/lib/logger";
import type { CustomerInput } from "@/lib/validation/customer";

export class NotFoundError extends Error { }
export class ConflictError extends Error { }

export async function listCustomers(
  userId: string,
  options: { search?: string; includeInactive?: boolean } = {},
): Promise<CustomerDoc[]> {
  const c = await col<CustomerDoc>("customers");
  const query: Record<string, unknown> = {
    userId,
    deletedAt: null,
  };
  if (!options.includeInactive) query.isActive = true;
  if (options.search?.trim()) {
    const re = new RegExp(options.search.trim(), "i");
    query.$or = [{ name: re }, { phone: re }];
  }
  return c.find(query).sort({ name: 1 }).toArray() as Promise<CustomerDoc[]>;
}

export async function getCustomerById(userId: string, id: string): Promise<CustomerDoc> {
  const c = await col<CustomerDoc>("customers");
  const doc = await c.findOne({ _id: id, userId });
  if (!doc) throw new NotFoundError(`Customer ${id} not found`);
  return doc as CustomerDoc;
}

export async function createCustomer(
  userId: string,
  input: CustomerInput,
): Promise<CustomerDoc> {
  const id = nanoid();
  const now = new Date().toISOString();

  const doc: CustomerDoc = {
    _id: id,
    userId,
    name: input.name,
    phone: input.phone ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const c = await col<CustomerDoc>("customers");
  await c.insertOne(doc as any);
  logger.info("Customer created", { customerId: id });
  return doc;
}

export async function updateCustomer(
  userId: string,
  id: string,
  input: Partial<CustomerInput> & { isActive?: boolean },
): Promise<CustomerDoc> {
  const existing = await getCustomerById(userId, id);
  const now = new Date().toISOString();

  const updates: Partial<CustomerDoc> = {
    name: input.name !== undefined ? input.name : existing.name,
    phone: input.phone !== undefined ? input.phone : existing.phone,
    address: input.address !== undefined ? input.address : existing.address,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
    updatedAt: now,
  };

  const c = await col<CustomerDoc>("customers");
  await c.updateOne({ _id: id, userId }, { $set: updates });
  logger.info("Customer updated", { customerId: id });
  return getCustomerById(userId, id);
}

export async function deactivateCustomer(userId: string, id: string) {
  return updateCustomer(userId, id, { isActive: false });
}

export async function softDeleteCustomer(userId: string, id: string) {
  // Check for active orders
  const orders = await col<OrderDoc>("orders");
  const activeOrder = await orders.findOne({ userId, customerId: id, deletedAt: null });
  if (activeOrder) {
    throw new ConflictError(
      "This customer has existing orders and can't be deleted. Deactivate them instead.",
    );
  }

  const now = new Date().toISOString();
  const c = await col<CustomerDoc>("customers");
  await c.updateOne({ _id: id, userId }, { $set: { deletedAt: now, isActive: false, updatedAt: now } });
  logger.info("Customer soft-deleted", { customerId: id });
}

export interface CustomerSummary {
  totalOrders: number;
  totalPieces: number;
  totalWeightIn: string;
  totalWeightOut: string;
  totalLoss: string;
  totalFine: string;
  totalWeightIn2: string;
  totalWeightOut2: string;
}

export async function getCustomerSummary(userId: string, customerId: string): Promise<CustomerSummary> {
  const c = await col<OrderDoc>("orders");
  const rows = await c.find({ userId, customerId, deletedAt: null }).toArray();
  const precision = await getPrecisionPolicy(userId);
  const totals = calculateOrderTotals(
    rows.map((r) => ({
      pieces: r.pieces,
      weightIn: r.weightIn,
      weightOut: r.weightOut,
      makingCharge: r.makingCharge,
      loss: r.loss,
      fineTotal: r.fineTotal,
      weightIn2: r.weightIn2,
      weightOut2: r.weightOut2,
    })),
    precision,
  );

  return {
    totalOrders: rows.length,
    totalPieces: totals.totalPieces,
    totalWeightIn: totals.totalWeightIn,
    totalWeightOut: totals.totalWeightOut,
    totalLoss: totals.totalLoss,
    totalFine: totals.totalFineTotal,
    totalWeightIn2: totals.totalWeightIn2,
    totalWeightOut2: totals.totalWeightOut2,
  };
}

export async function getCustomerOrderHistory(userId: string, customerId: string) {
  const c = await col("orders");
  return c
    .find({ userId, customerId, deletedAt: null })
    .sort({ orderDate: -1, orderNumber: -1 })
    .toArray();
}
