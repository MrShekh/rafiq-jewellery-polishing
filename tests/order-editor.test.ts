import { describe, expect, it } from "vitest";
import type { Order } from "@/db/schema";
import { calculateOrderTotals, customerNetBalance, DEFAULT_PRECISION } from "@/lib/calculations";
import { OrderSaveQueue, previewOrder, replaceRegistryOrder, type OrdersResponse } from "@/lib/order-editor";

const row = { id: "one", pieces: 1, weightIn: "10", weightOut: "9", makingCharge: "0", touch: "75", loss: "1.000", fineTotal: "0.750", clearedAmount: "0.250", clearStatus: "partial" } as Order;

describe("customer balance", () => {
  it.each([
    ["12", "8", "4.000", "collect"], ["8", "12", "4.000", "return"], ["8", "8", "0.000", "balanced"],
    ["0.3", "0.1", "0.200", "collect"],
  ])("offsets %s owed by customer against %s owed to customer", (collect, giveBack, amount, direction) => {
    expect(customerNetBalance(collect, giveBack)).toEqual({ amount, direction });
  });
});

describe("registry updates", () => {
  it("updates loss and fine immediately with a making charge and second step", () => {
    const updated = previewOrder(row, { weightIn2: "5", weightOut2: "4", makingCharge: "3" }, DEFAULT_PRECISION, "v1-standard");
    expect(updated.loss).toBe("-1.000");
    expect(updated.fineTotal).toBe("0.750");
    expect(updated.clearedAmount).toBe("0.250");
  });

  it("adjusts full-filter totals without losing totals from other pages", () => {
    const offPage = { ...row, id: "two" };
    const data: OrdersResponse = { orders: [row], total: 2, totals: calculateOrderTotals([row, offPage]), page: 1, pageSize: 1, precision: DEFAULT_PRECISION, formulaVersion: "v1-standard" };
    const changed = previewOrder(row, { weightOut: "8" }, data.precision, data.formulaVersion);
    expect(replaceRegistryOrder(data, changed).totals).toEqual(calculateOrderTotals([changed, offPage]));
  });

  it("saves rapid changes to one order in sequence while other orders can save", async () => {
    const queue = new OrderSaveQueue();
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = queue.run("one", async () => { calls.push("first"); await gate; });
    const second = queue.run("one", async () => { calls.push("second"); });
    await queue.run("two", async () => { calls.push("other"); });
    expect(calls).toEqual(["first", "other"]);
    release();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first", "other", "second"]);
  });

  it("allows the next edit after a failed save", async () => {
    const queue = new OrderSaveQueue();
    const failed = queue.run("one", async () => { throw new Error("offline"); });
    const next = queue.run("one", async () => "saved");
    await expect(failed).rejects.toThrow("offline");
    await expect(next).resolves.toBe("saved");
  });
});
