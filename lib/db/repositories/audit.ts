import { nanoid } from "nanoid";

import { auditLogs } from "@/db/schema";
import type { Transaction } from "@/lib/db/client";

export function recordAudit(
  tx: Transaction,
  entry: {
    entityType: string;
    entityId?: string | null;
    action: string;
    userId?: string | null;
    before?: unknown;
    after?: unknown;
    message?: string;
  },
) {
  tx.insert(auditLogs)
    .values({
      id: nanoid(),
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      userId: entry.userId ?? null,
      beforeJson: entry.before !== undefined ? JSON.stringify(entry.before) : null,
      afterJson: entry.after !== undefined ? JSON.stringify(entry.after) : null,
      message: entry.message ?? null,
    })
    .run();
}
