import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { runSyncCycle } from "@/lib/sync/engine";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

/** Manually trigger a sync pass (used by the "Sync now" button in Settings,
 * and by the app on startup / reconnect - section 26). Never blocks the UI
 * for long: the engine itself caps batch size and uses short connect
 * timeouts. */
export async function POST() {
  try {
    await requireUser();
    const result = await runSyncCycle();
    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}
