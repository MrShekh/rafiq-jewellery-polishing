import { and, desc, gte, isNull, lte } from "drizzle-orm";

import { orders } from "@/db/schema";
import { db } from "@/lib/db/client";
import { calculateOrderTotals, type OrderTotals } from "@/lib/calculations";
import { getPrecisionPolicy } from "@/lib/db/repositories/settings";

function todayRangeIso(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const localDateStr = `${year}-${month}-${day}`;
  return { start: localDateStr, end: localDateStr };
}

function monthRangeIso(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const start = "01";
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const end = String(lastDay).padStart(2, "0");

  return {
    start: `${year}-${month}-${start}`,
    end: `${year}-${month}-${end}`,
  };
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
      weightIn2: orders.weightIn2,
      weightOut2: orders.weightOut2,
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
