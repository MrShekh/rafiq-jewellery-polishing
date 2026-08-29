import { col } from "@/lib/db/mongo";
import { type OrderDoc } from "@/lib/db/types";
import { calculateOrderTotals, type OrderTotals } from "@/lib/calculations";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";

function todayRangeIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const s = `${y}-${m}-${d}`;
  return { start: s, end: s };
}

function monthRangeIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, "0")}` };
}

async function summarizeRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<OrderTotals & { orderCount: number }> {
  const c = await col<OrderDoc>("orders");
  const rows = await c
    .find(
      { userId, deletedAt: null, orderDate: { $gte: startDate, $lte: endDate } },
      { projection: { pieces: 1, weightIn: 1, weightOut: 1, makingCharge: 1, loss: 1, fineTotal: 1, weightIn2: 1, weightOut2: 1 } },
    )
    .toArray();

  const precision = await getPrecisionPolicy(userId);
  const totals = calculateOrderTotals(rows as any[], precision);
  return { ...totals, orderCount: rows.length };
}

export async function getTodaySummary(userId: string) {
  const { start, end } = todayRangeIso();
  return summarizeRange(userId, start, end);
}

export async function getMonthlySummary(userId: string) {
  const { start, end } = monthRangeIso();
  return summarizeRange(userId, start, end);
}

export async function getRecentOrders(userId: string, limit = 10): Promise<OrderDoc[]> {
  const c = await col<OrderDoc>("orders");
  return c.find({ userId, deletedAt: null }).sort({ createdAt: -1 }).limit(limit).toArray() as Promise<OrderDoc[]>;
}
