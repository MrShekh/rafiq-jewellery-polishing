import { z } from "zod";
import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getSyncStatusSnapshot, setSyncMeta, SYNC_META_KEYS } from "@/lib/db/repositories/sync";
import { isCloudSyncConfigured } from "@/lib/sync/mongo";
import { setSetting } from "@/lib/db/repositories/settings";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({ ...getSyncStatusSnapshot(), cloudSyncConfigured: isCloudSyncConfigured() });
  } catch (err) {
    return handleApiError(err);
  }
}

const tenantSchema = z.object({
  tenantId: z.string().trim().min(1, "Sync ID is required").max(100),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = tenantSchema.parse(await req.json());
    setSetting("app.tenant_id", body.tenantId);
    // Reset last sync completed time so the next sync cycle pulls all records for the new tenant
    setSyncMeta(SYNC_META_KEYS.lastSyncCompletedAt, "");
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
