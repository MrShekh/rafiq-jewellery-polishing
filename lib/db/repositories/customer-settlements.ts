import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type { ClientSession } from "mongodb";
import { col, withMongoTransaction } from "@/lib/db/mongo";
import type { CustomerDoc, OrderDoc } from "@/lib/db/types";
import { calculateOrderTotals, customerNetBalance, type PrecisionPolicy } from "@/lib/calculations";
import type { CustomerSettlementPreview } from "@/lib/customer-settlement";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";
import { ConflictError, NotFoundError } from "@/lib/db/repositories/orders";

interface SettlementDoc extends CustomerSettlementPreview {
  _id: string;
  userId: string;
  customerId: string;
  createdAt: string;
  orders: { id: string; orderNumber: string; fineTotal: string; clearedBefore: string; loss: string }[];
}

export function settlementPreview(rows: OrderDoc[], precision: PrecisionPolicy): CustomerSettlementPreview {
  const totals = calculateOrderTotals(rows, precision);
  // Include versions and amounts so a stale preview cannot clear changed orders.
  const snapshot = rows.map((r) => [r._id, r.updatedAt, r.fineTotal, r.clearedAmount ?? "0", r.loss]).sort((a, b) => a[0].localeCompare(b[0]));
  return {
    token: createHash("sha256").update(JSON.stringify([precision, snapshot])).digest("hex"),
    orderCount: rows.length,
    toCollect: totals.totalFineToCollect,
    toReturn: totals.totalFineToReturn,
    ...customerNetBalance(totals.totalFineToCollect, totals.totalFineToReturn, precision.fine),
  };
}

async function outstandingOrders(userId: string, customerId: string, session?: ClientSession) {
  const customers = await col<CustomerDoc>("customers");
  if (!await customers.findOne({ _id: customerId, userId, deletedAt: null }, { session })) {
    throw new NotFoundError("Customer not found.");
  }
  const orders = await col<OrderDoc>("orders");
  return orders.find({ userId, customerId, deletedAt: null, clearStatus: { $ne: "cleared" } }, { session }).toArray();
}

export async function getCustomerSettlement(userId: string, customerId: string) {
  const [rows, precision, collection] = await Promise.all([
    outstandingOrders(userId, customerId), getPrecisionPolicy(userId), col<SettlementDoc>("customer_settlements"),
  ]);
  const history = await collection.find({ userId, customerId }, { projection: { orders: 0, userId: 0, customerId: 0 } })
    .sort({ createdAt: -1 }).limit(20).toArray();
  return { preview: settlementPreview(rows, precision), settlements: history.map(({ _id, ...record }) => ({ ...record, id: _id })) };
}

export async function clearCustomerBalance(userId: string, customerId: string, token: string) {
  const precision = await getPrecisionPolicy(userId);
  return withMongoTransaction(async (session) => {
    const collection = await col<SettlementDoc>("customer_settlements");
    // A retry after a lost response returns the original settlement.
    const previous = await collection.findOne({ userId, customerId, token }, { session });
    if (previous) return { id: previous._id, orderCount: previous.orderCount };
    const rows = await outstandingOrders(userId, customerId, session);
    const preview = settlementPreview(rows, precision);
    if (preview.token !== token) throw new ConflictError("This customer's orders changed. Review the updated balance before clearing.");
    if (!rows.length) throw new ConflictError("This customer has no outstanding orders to clear.");
    const orders = await col<OrderDoc>("orders");
    const now = new Date(rows.reduce((timestamp, row) => Math.max(timestamp, Date.parse(row.updatedAt) + 1), Date.now())).toISOString();
    const result = await orders.bulkWrite(rows.map((order) => ({
      updateOne: {
        filter: { _id: order._id, userId, customerId, updatedAt: order.updatedAt, deletedAt: null },
        update: { $set: { clearedAmount: order.fineTotal, clearStatus: "cleared" as const, clearedAt: now, updatedAt: now, updatedBy: userId } },
      },
    })), { session });
    if (result.matchedCount !== rows.length) throw new ConflictError("Orders changed during settlement. Please review the balance again.");
    const id = nanoid();
    await collection.insertOne({
      _id: id, userId, customerId, createdAt: now, ...preview,
      orders: rows.map((r) => ({ id: r._id, orderNumber: r.orderNumber, fineTotal: r.fineTotal, clearedBefore: r.clearedAmount ?? "0", loss: r.loss })),
    }, { session });
    return { id, orderCount: rows.length };
  });
}
