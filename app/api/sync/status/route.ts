import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({
      pendingCount: 0,
      failedCount: 0,
      lastSyncStartedAt: new Date().toISOString(),
      lastSyncCompletedAt: new Date().toISOString(),
      lastSyncError: null,
      cloudSyncConfigured: true,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
