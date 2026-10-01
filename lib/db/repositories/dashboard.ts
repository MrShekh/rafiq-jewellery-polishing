import { col } from "@/lib/db/mongo";
import { type OrderDoc } from "@/lib/db/types";
import { calculateOrderTotals, type OrderTotals } from "@/lib/calculations";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";
import { businessDateRanges } from "@/lib/business-date";

async function summarizeRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<OrderTotals & { orderCount: number }> {
  const c = await col<OrderDoc>("orders");
  const rows = await c
    .find(
      { userId, deletedAt: null, orderDate: { $gte: startDate, $lte: endDate } },
      {
        projection: {
          pieces: 1,
          weightIn: 1,
          weightOut: 1,
          makingCharge: 1,
          loss: 1,
          fineTotal: 1,
          weightIn2: 1,
          weightOut2: 1,
          pieces2: 1,
          clearedAmount: 1,
        },
      },
    )
    .toArray();

  const precision = await getPrecisionPolicy(userId);
  const totals = calculateOrderTotals(rows as any[], precision);
  return { ...totals, orderCount: rows.length };
}

export async function getTodaySummary(userId: string, now = new Date()) {
  const { start, end } = businessDateRanges(now).today;
  return summarizeRange(userId, start, end);
}

export async function getMonthlySummary(userId: string, now = new Date()) {
  const { start, end } = businessDateRanges(now).month;
  return summarizeRange(userId, start, end);
}

export async function getRecentOrders(userId: string, limit = 10): Promise<OrderDoc[]> {
  const c = await col<OrderDoc>("orders");
  return c.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).limit(limit).toArray() as Promise<OrderDoc[]>;
}
