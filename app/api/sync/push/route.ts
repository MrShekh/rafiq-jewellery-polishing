import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { isCloudSyncConfigured } from "@/lib/sync/mongo";
import { pushRecord, pushDelete } from "@/lib/sync/cloud";
import { logger } from "@/lib/logger";

// Always dynamic: reads the session cookie and talks to Mongo per request.
export const dynamic = "force-dynamic";

/**
 * Desktop SQLite -> cloud push endpoint (brief section 4).
 *
 * The automatic background engine (lib/sync/engine.ts) already drains this
 * device's own outbox in-process for speed - it does not call this route
 * for itself. This endpoint exists as the literal, independently callable
 * "push a batch of records" API the brief asks for: authenticated,
 * tenant-scoped (every record is stamped with *this session's* tenantId
 * server-side, a client can never claim another tenant's), and idempotent
 * (upsert-by-id via lib/sync/cloud.ts, so sending the same record twice -
 * e.g. after a dropped connection - never creates a duplicate).
 */
const pushItemSchema = z.object({
  entityType: z.enum(["customer", "order"]),
  entityId: z.string().min(1),
  operation: z.enum(["upsert", "delete"]),
  payload: z.record(z.unknown()).optional(),
});

const pushSchema = z.object({
  records: z.array(pushItemSchema).min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    if (!isCloudSyncConfigured()) {
      return ok({ error: "Cloud sync is not configured on this server." }, 503);
    }

    const { records } = pushSchema.parse(await req.json());

    const results = await Promise.all(
      records.map(async (record) => {
        try {
          if (record.operation === "upsert") {
            await pushRecord(record.entityType, record.entityId, record.payload ?? {});
          } else {
            await pushDelete(record.entityType, record.entityId);
          }
          return { entityId: record.entityId, status: "ok" as const };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Push endpoint: record failed", { entityId: record.entityId, error: message });
          return { entityId: record.entityId, status: "error" as const, error: message };
        }
      }),
    );

    const failed = results.filter((r) => r.status === "error").length;
    return ok({ succeeded: results.length - failed, failed, results });
  } catch (err) {
    return handleApiError(err);
  }
}
