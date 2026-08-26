import { nanoid } from "nanoid";

import { syncQueue } from "@/db/schema";
import type { Transaction } from "@/lib/db/client";

/**
 * Appends one row to the sync outbox (`sync_queue`) inside the caller's
 * transaction. This is the "Create/update sync queue" step of the
 * validate -> calculate -> save -> queue pipeline described in brief
 * section 40 - it happens in the *same* SQLite transaction as the
 * order/customer write, so a crash between the two can never happen (the
 * whole write commits or none of it does).
 *
 * The sync engine (lib/sync/engine.ts) later drains this table in FIFO
 * order and is solely responsible for talking to MongoDB.
 */
export function queueSync(
  tx: Transaction,
  entityType: "customer" | "order",
  entityId: string,
  operation: "upsert" | "delete",
  payload: unknown,
) {
  tx.insert(syncQueue)
    .values({
      id: nanoid(),
      entityType,
      entityId,
      operation,
      payload: JSON.stringify(payload),
    })
    .run();
}
