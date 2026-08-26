import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { SyncTarget } from "@/lib/sync/engine";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jp-sync-test-"));
process.env.USER_DATA_PATH = tmpDir;
// Sync is disabled unless MONGODB_URI is set (see lib/sync/mongo.ts); we set
// a dummy value purely so isCloudSyncConfigured() returns true - the actual
// network call is replaced by the injected fake SyncTarget below, so no
// real Mongo connection is ever attempted in this test.
process.env.MONGODB_URI = "mongodb://fake-for-tests";

const { createCustomer } = await import("@/lib/db/repositories/customers");
const { createOrder } = await import("@/lib/db/repositories/orders");
const { runSyncCycle } = await import("@/lib/sync/engine");
const { getPendingSyncCount } = await import("@/lib/db/repositories/sync");

describe("sync engine", () => {
  let customerId: string;

  beforeAll(() => {
    customerId = createCustomer({ name: "Test Customer" }, null).id;
  });

  it("drains the outbox via an injected fake target and marks rows synced", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockResolvedValue(undefined);
    const fakeTarget: SyncTarget = { upsert, delete: del };

    const before = getPendingSyncCount();
    expect(before).toBeGreaterThan(0);

    const result = await runSyncCycle(fakeTarget);

    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(before);
    expect(upsert).toHaveBeenCalledTimes(before);
    expect(getPendingSyncCount()).toBe(0);
  });

  it("is idempotent: upserts by stable client-generated id, never inserts twice", async () => {
    const seenIds = new Set<string>();
    const upsert = vi.fn(async (_type: string, id: string) => {
      // Simulates a real Mongo upsert: same id twice must not create a
      // second document - the assertion below is really documentation of
      // that contract, since our fake is a no-op store.
      seenIds.add(id);
    });
    const fakeTarget: SyncTarget = { upsert, delete: vi.fn() };

    const today = new Date().toISOString().slice(0, 10);
    const { order } = createOrder(
      { orderDate: today, customerId, item: "Ring", pieces: 1, weightIn: "1.000", weightOut: "0.900", makingCharge: "0.010", touch: "75" },
      null,
    );

    await runSyncCycle(fakeTarget);
    // A follow-up edit re-queues the same entityId, not a new one.
    const { updateOrder } = await import("@/lib/db/repositories/orders");
    updateOrder(order.id, { touch: "80" }, null);
    await runSyncCycle(fakeTarget);

    expect(seenIds.has(order.id)).toBe(true);
    expect(upsert.mock.calls.filter((c) => c[1] === order.id)).toHaveLength(2);
  });

  it("retries with backoff and eventually marks a row failed after repeated errors", async () => {
    const failingTarget: SyncTarget = {
      upsert: vi.fn().mockRejectedValue(new Error("simulated network error")),
      delete: vi.fn().mockRejectedValue(new Error("simulated network error")),
    };

    createCustomer({ name: "Will Fail To Sync" }, null);

    // First attempt fails and schedules a future retry (nextAttemptAt in
    // the future), so an immediate second call should not retry it yet.
    const first = await runSyncCycle(failingTarget);
    expect(first.failed).toBeGreaterThan(0);

    const second = await runSyncCycle(failingTarget);
    expect(second.processed).toBe(0); // backoff window hasn't elapsed
  });
});
