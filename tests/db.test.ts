import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeAll, afterAll, describe, expect, it } from "vitest";

// The DB client resolves its file path from USER_DATA_PATH at import time
// (see lib/paths.ts), so we point it at a throwaway temp directory *before*
// importing anything that touches the database - each test run gets a
// fresh, isolated SQLite file rather than the developer's real data.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jp-db-test-"));
process.env.USER_DATA_PATH = tmpDir;

// See lib/db/client.ts:__resetConnectionForTests - required because this
// suite runs in the same worker process as tests/sync.test.ts (isolate:
// false in vitest.db.config.mts), so the DB connection singleton would
// otherwise be shared between the two files.
const { __resetConnectionForTests } = await import("@/lib/db/client");
__resetConnectionForTests();

const { createCustomer, listCustomers, softDeleteCustomer } = await import("@/lib/db/repositories/customers");
const { createOrder, updateOrder, softDeleteOrder, listOrders } = await import("@/lib/db/repositories/orders");
const { getTodaySummary } = await import("@/lib/db/repositories/dashboard");
const { getPendingSyncCount } = await import("@/lib/db/repositories/sync");

describe("customers + orders CRUD", () => {
  let customerId: string;

  beforeAll(() => {
    const customer = createCustomer({ name: "ABC Jewellers", phone: "9999999999" }, null);
    customerId = customer.id;
  });

  it("creates a customer and queues it for sync", () => {
    const list = listCustomers();
    expect(list.some((c) => c.id === customerId)).toBe(true);
    expect(getPendingSyncCount()).toBeGreaterThan(0);
  });

  it("creates an order with a generated order number and correct calculations", () => {
    const today = new Date().toISOString().slice(0, 10);
    const { order, warnings } = createOrder(
      {
        orderDate: today,
        customerId,
        item: "Ring",
        pieces: 10,
        weightIn: "25.500",
        weightOut: "25.100",
        makingCharge: "0.100",
        touch: "75",
        weightExceedsConfirmed: false,
      },
      null,
    );

    expect(order.orderNumber).toMatch(/^ORD-\d{8}-0001$/);
    expect(order.loss).toBe("0.300");
    expect(order.fineTotal).toBe("0.225");
    expect(warnings).toHaveLength(0);
  });

  it("increments the daily sequence for a second order on the same day", () => {
    const today = new Date().toISOString().slice(0, 10);
    const { order } = createOrder(
      {
        orderDate: today,
        customerId,
        item: "Chain",
        pieces: 1,
        weightIn: "5.000",
        weightOut: "4.900",
        makingCharge: "0.010",
        touch: "80",
      },
      null,
    );
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-0002$/);
  });

  it("recalculates Loss/Fine Total on update", () => {
    const today = new Date().toISOString().slice(0, 10);
    const { order } = createOrder(
      { orderDate: today, customerId, item: "Bracelet", pieces: 2, weightIn: "10.000", weightOut: "9.500", makingCharge: "0.100", touch: "70" },
      null,
    );
    expect(order.fineTotal).toBe("0.280"); // (10-9.5-0.1)=0.4 * 70/100 = 0.28

    const { order: updated } = updateOrder(order.id, { touch: "90" }, null);
    expect(updated.loss).toBe("0.400"); // unchanged
    expect(updated.fineTotal).toBe("0.360"); // 0.4 * 90/100
  });

  it("reflects new orders in today's dashboard summary", () => {
    const summary = getTodaySummary();
    expect(summary.orderCount).toBeGreaterThanOrEqual(3);
  });

  it("soft-deletes an order (excluded from default listing, keeps history)", () => {
    const today = new Date().toISOString().slice(0, 10);
    const { order } = createOrder(
      { orderDate: today, customerId, item: "Earrings", pieces: 1, weightIn: "3.000", weightOut: "2.900", makingCharge: "0.010", touch: "60" },
      null,
    );

    softDeleteOrder(order.id, null);

    const { rows } = listOrders({
      page: 1,
      pageSize: 200,
      sortBy: "orderDate",
      sortDir: "desc",
      includeDeleted: false,
    } as never);
    expect(rows.some((r) => r.id === order.id)).toBe(false);
  });

  it("refuses to hard-delete a customer with active orders", () => {
    expect(() => softDeleteCustomer(customerId, null)).toThrow();
  });
});

afterAll(() => {
  // Close the SQLite handle before deleting its directory - Windows refuses
  // to remove a file that's still open (EPERM), unlike POSIX.
  __resetConnectionForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
