import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getSyncStatusSnapshot } from "@/lib/db/repositories/sync";
import { isCloudSyncConfigured } from "@/lib/sync/mongo";

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
