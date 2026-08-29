import { nanoid } from "nanoid";
import { col } from "@/lib/db/mongo";

export async function recordAudit(
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
  try {
    const c = await col("audit_logs");
    await c.insertOne({
      _id: nanoid(),
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      userId: entry.userId ?? null,
      beforeJson: entry.before !== undefined ? JSON.stringify(entry.before) : null,
      afterJson: entry.after !== undefined ? JSON.stringify(entry.after) : null,
      message: entry.message ?? null,
      createdAt: new Date().toISOString(),
    } as any);
  } catch (err) {
    console.error("Failed to record audit log:", err);
  }
}
