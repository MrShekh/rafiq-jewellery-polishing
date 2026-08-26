import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { listAvailableBackups } from "@/lib/backup/backup";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({ backups: listAvailableBackups() });
  } catch (err) {
    return handleApiError(err);
  }
}
