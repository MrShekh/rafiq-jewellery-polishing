import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDoc } from "@/lib/db/types";
import { DEFAULT_PRECISION } from "@/lib/calculations";

const db = vi.hoisted(() => ({ orders: [] as any[], settlements: [] as any[], failInsert: false, session: { transaction: true }, filters: [] as any[] }));
vi.mock("@/lib/db/repositories/settings", () => ({ getPrecisionPolicy: async () => ({ weight: 3, touch: 2, fine: 3 }) }));
vi.mock("@/lib/db/repositories/orders", () => ({ ConflictError: class extends Error {}, NotFoundError: class extends Error {} }));
vi.mock("@/lib/db/mongo", () => ({
  withMongoTransaction: async (work: (session: unknown) => Promise<unknown>) => {
    const backup = structuredClone({ orders: db.orders, settlements: db.settlements });
    try { return await work(db.session); }
    catch (err) { db.orders = backup.orders; db.settlements = backup.settlements; throw err; }
  },
  col: async (name: string) => {
    if (name === "customers") return { findOne: async (filter: any) => filter._id === "customer" && filter.userId === "owner" ? { _id: "customer" } : null };
    if (name === "customer_settlements") return {
      findOne: async (filter: any) => db.settlements.find((r) => Object.entries(filter).every(([k, v]) => r[k] === v)),
      insertOne: async (record: any, options: any) => { expect(options.session).toBe(db.session); if (db.failInsert) throw new Error("Write failed"); db.settlements.push(record); },
    };
    return {
      find: (filter: any) => {
        db.filters.push(filter);
        return { toArray: async () => structuredClone(db.orders.filter((r) => r.userId === filter.userId && r.customerId === filter.customerId && r.deletedAt == null && r.clearStatus !== "cleared")) };
      },
      bulkWrite: async (ops: any[], options: any) => {
        expect(options.session).toBe(db.session);
        let matchedCount = 0;
        for (const { updateOne } of ops) {
          const row = db.orders.find((r) => Object.entries(updateOne.filter).every(([key, value]) => r[key] === value));
          if (row) { Object.assign(row, updateOne.update.$set); matchedCount++; }
        }
        return { matchedCount };
      },
    };
  },
}));

import { clearCustomerBalance, settlementPreview } from "@/lib/db/repositories/customer-settlements";

function order(id: string, overrides: Partial<OrderDoc> = {}): OrderDoc {
  return { _id: id, userId: "owner", customerId: "customer", orderNumber: id, orderDate: "2026-09-30", customerNameSnapshot: "Customer", item: "Ring", pieces: 1, weightIn: "20", weightOut: "10", makingCharge: "0", loss: "10", touch: "100", fineTotal: "10", clearedAmount: "0", clearStatus: "open", weightExceedsConfirmed: false, createdAt: "2026-09-30T00:00:00Z", updatedAt: "2026-09-30T00:00:00Z", deletedAt: null, ...overrides };
}

beforeEach(() => { db.orders = []; db.settlements = []; db.filters = []; db.failInsert = false; });

describe("customer settlements", () => {
  it("nets ten mixed orders, excludes old payments and clears only this customer's active orders", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => order(String(i), { loss: i < 6 ? "-2" : "2", fineTotal: "2", clearedAmount: i === 0 ? "1" : "0" }));
    const preview = settlementPreview(rows, DEFAULT_PRECISION);
    expect(preview).toMatchObject({ orderCount: 10, toCollect: "11.000", toReturn: "8.000", amount: "3.000", direction: "collect" });
    const untouched = [order("another-customer", { customerId: "other" }), order("another-user", { userId: "other" }), order("deleted", { deletedAt: "2026-09-01" }), order("settled", { clearStatus: "cleared", clearedAmount: "10" })];
    db.orders = [...rows, ...untouched];
    await clearCustomerBalance("owner", "customer", preview.token);
    expect(db.orders.slice(0, 10).every((r) => r.clearStatus === "cleared" && r.clearedAmount === r.fineTotal)).toBe(true);
    expect(db.orders.slice(10)).toEqual(untouched);
    expect(db.settlements[0]).toMatchObject({ amount: "3.000", orderCount: 10 });
    expect(db.settlements[0].orders[0].clearedBefore).toBe("1");
  });

  it("settles offsetting orders even when the net payment is zero", async () => {
    db.orders = [order("return"), order("collect", { loss: "-10" })];
    const preview = settlementPreview(db.orders, DEFAULT_PRECISION);
    expect(preview.direction).toBe("balanced");
    await clearCustomerBalance("owner", "customer", preview.token);
    expect(db.orders.every((r) => r.clearStatus === "cleared")).toBe(true);
  });

  it("rejects a stale review after an order changes or is added", async () => {
    db.orders = [order("first")];
    const preview = settlementPreview(db.orders, DEFAULT_PRECISION);
    db.orders.push(order("new"));
    await expect(clearCustomerBalance("owner", "customer", preview.token)).rejects.toThrow("changed");
    expect(db.settlements).toHaveLength(0);
    expect(db.orders.every((r) => r.clearStatus === "open")).toBe(true);
  });

  it("does not clear newly added orders when a previous request is retried", async () => {
    db.orders = [order("first")];
    const preview = settlementPreview(db.orders, DEFAULT_PRECISION);
    const result = await clearCustomerBalance("owner", "customer", preview.token);
    db.orders.push(order("new"));
    expect(await clearCustomerBalance("owner", "customer", preview.token)).toEqual(result);
    expect(db.orders[1].clearStatus).toBe("open");
    expect(db.settlements).toHaveLength(1);
  });

  it("rolls back the order updates if the settlement record fails", async () => {
    db.orders = [order("first")];
    const preview = settlementPreview(db.orders, DEFAULT_PRECISION);
    db.failInsert = true;
    await expect(clearCustomerBalance("owner", "customer", preview.token)).rejects.toThrow("Write failed");
    expect(db.orders[0].clearStatus).toBe("open");
    expect(db.settlements).toHaveLength(0);
  });

  it("rejects attempts to settle another account's customer", async () => {
    db.orders = [order("first")];
    await expect(clearCustomerBalance("other", "customer", settlementPreview(db.orders, DEFAULT_PRECISION).token)).rejects.toThrow("not found");
  });
});
