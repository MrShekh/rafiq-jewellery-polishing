import { handleApiError, ok } from "@/lib/api/respond";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    await destroySession();
    if (user) logger.info("Logout", { userId: user.id });
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
