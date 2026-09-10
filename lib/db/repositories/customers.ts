import { nanoid } from "nanoid";
import { col, mapDoc, mapDocs } from "@/lib/db/mongo";
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
): Promise<any[]> {
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
  const docs = await c.find(query).sort({ name: 1 }).toArray();

  const orders = await col<OrderDoc>("orders");
  const dueAgg = await orders
    .aggregate([
      { $match: { userId, deletedAt: null } },
      {
        $group: {
          _id: "$customerId",
          orderCount: { $sum: 1 },
          due: {
            $sum: {
              $max: [
                {
                  $subtract: [
                    { $toDouble: "$fineTotal" },
                    { $toDouble: { $ifNull: ["$clearedAmount", "0"] } },
                  ],
                },
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();
  const dueMap = new Map(dueAgg.map((d: any) => [d._id as string, { due: d.due as number, orderCount: d.orderCount as number }]));
  const precision = await getPrecisionPolicy(userId);

  return mapDocs(docs).map((customer) => {
    const agg = dueMap.get(customer._id);
    return {
      ...customer,
      orderCount: agg?.orderCount ?? 0,
      dueFine: (agg?.due ?? 0).toFixed(precision.fine),
    };
  });
}

export async function getCustomerById(userId: string, id: string): Promise<any> {
  const c = await col<CustomerDoc>("customers");
  const doc = await c.findOne({ _id: id, userId });
  if (!doc) throw new NotFoundError(`Customer ${id} not found`);
  return mapDoc(doc);
}

export async function createCustomer(
  userId: string,
  input: CustomerInput,
): Promise<any> {
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
  return mapDoc(doc);
}

export async function updateCustomer(
  userId: string,
  id: string,
  input: Partial<CustomerInput> & { isActive?: boolean },
): Promise<any> {
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
  /** Outstanding fine only (already-cleared amounts are excluded) - see lib/calculations#outstandingFine. */
  totalFine: string;
  totalWeightIn2: string;
  totalWeightOut2: string;
  totalPieces2: number;
  /** How much fine has already been settled/returned to this customer. */
  totalReturned: string;
  /** Outstanding fine where karigar must return gold to the customer (loss >= 0). */
  totalFineToReturn: string;
  /** Outstanding fine where customer must pay gold to the karigar (loss < 0). */
  totalFineToCollect: string;
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
      pieces2: r.pieces2,
      clearedAmount: r.clearedAmount,
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
    totalPieces2: totals.totalPieces2,
    totalReturned: totals.totalCleared,
    totalFineToReturn: totals.totalFineToReturn,
    totalFineToCollect: totals.totalFineToCollect,
  };
}

export async function getCustomerOrderHistory(userId: string, customerId: string): Promise<any[]> {
  const c = await col<OrderDoc>("orders");
  const docs = await c
    .find({ userId, customerId, deletedAt: null })
    .sort({ orderDate: -1, orderNumber: -1 })
    .toArray();
  return mapDocs(docs);
}
