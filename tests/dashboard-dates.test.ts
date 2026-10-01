import { describe, expect, it, vi } from "vitest";
import { businessDateIso, businessDateRanges } from "@/lib/business-date";

const database = vi.hoisted(() => ({ rows: [] as any[], queries: [] as any[] }));
vi.mock("@/lib/db/mongo", () => ({
  col: async () => ({ find: (query: any) => {
    database.queries.push(query);
    return { toArray: async () => database.rows.filter((row) => row.userId === query.userId && row.deletedAt == null && row.orderDate >= query.orderDate.$gte && row.orderDate <= query.orderDate.$lte) };
  } }),
}));
vi.mock("@/lib/db/repositories/settings", () => ({ getPrecisionPolicy: async () => ({ weight: 3, touch: 2, fine: 3 }) }));

import { getTodaySummary, getMonthlySummary } from "@/lib/db/repositories/dashboard";

describe("India business dates", () => {
  it.each([
    ["2026-10-01T18:29:59Z", "2026-10-01"],
    ["2026-10-01T18:30:00Z", "2026-10-02"],
    ["2026-10-01T20:30:00Z", "2026-10-02"], // 2 a.m. India; UTC is still yesterday.
    ["2026-10-02T06:30:00Z", "2026-10-02"],
    ["2026-12-31T18:30:00Z", "2027-01-01"],
  ])("uses %s as calendar date %s", (instant, expected) => {
    expect(businessDateIso(new Date(instant))).toBe(expected);
  });

  it("switches the daily and monthly ranges together at Indian midnight", () => {
    expect(businessDateRanges(new Date("2026-09-30T18:30:00Z"))).toEqual({
      today: { start: "2026-10-01", end: "2026-10-01" },
      month: { start: "2026-10-01", end: "2026-10-31" },
    });
  });

  it.each([["2028-02-10T12:00:00Z", "2028-02-29"], ["2027-02-10T12:00:00Z", "2027-02-28"]])("handles February at %s", (instant, end) => {
    expect(businessDateRanges(new Date(instant)).month.end).toBe(end);
  });
});

describe("dashboard date selection", () => {
  it("includes a newly dated order in both today and month before 5:30 a.m. India", async () => {
    const now = new Date("2026-10-01T20:30:00Z");
    const base = { userId: "owner", deletedAt: null, pieces: 1, weightIn: "10", weightOut: "9", makingCharge: "0", loss: "1", fineTotal: "0.750", clearedAmount: "0" };
    database.rows = [
      { ...base, orderDate: businessDateIso(now) },
      { ...base, orderDate: "2026-10-01", updatedAt: now.toISOString() },
      { ...base, userId: "another-account", orderDate: businessDateIso(now) },
      { ...base, deletedAt: now.toISOString(), orderDate: businessDateIso(now) },
    ];
    database.queries = [];
    const today = await getTodaySummary("owner", now);
    const month = await getMonthlySummary("owner", now);
    expect(today.orderCount).toBe(1);
    expect(today.totalFineTotal).toBe("0.750");
    expect(month.orderCount).toBe(2);
    expect(month.totalFineTotal).toBe("1.500");
    expect(database.queries[0].orderDate).toEqual({ $gte: "2026-10-02", $lte: "2026-10-02" });
  });
});
