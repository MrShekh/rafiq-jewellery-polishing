import { and, desc, gte, isNull, lte } from "drizzle-orm";

import { orders } from "@/db/schema";
import { db } from "@/lib/db/client";
import { calculateOrderTotals, type OrderTotals } from "@/lib/calculations";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";

function todayRangeIso(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = start.toISOString().slice(0, 10);
  return { start: iso, end: iso };
}

function monthRangeIso(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function summarizeRange(startDate: string, endDate: string): OrderTotals & { orderCount: number } {
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
    .where(and(gte(orders.orderDate, startDate), lte(orders.orderDate, endDate), isNull(orders.deletedAt)))
    .all();

  const totals = calculateOrderTotals(rows, getPrecisionPolicy());
  return { ...totals, orderCount: rows.length };
}

export function getTodaySummary() {
  const { start, end } = todayRangeIso();
  return summarizeRange(start, end);
}

export function getMonthlySummary() {
  const { start, end } = monthRangeIso();
  return summarizeRange(start, end);
}

export function getRecentOrders(limit = 10) {
  return db
    .select()
    .from(orders)
    .where(isNull(orders.deletedAt))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .all();
}
