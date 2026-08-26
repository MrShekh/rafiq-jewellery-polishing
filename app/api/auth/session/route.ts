import { handleApiError, ok } from "@/lib/api/respond";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/db/repositories/users";
import { isFirstRunComplete } from "@/lib/db/repositories/settings";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return ok({ user, firstRunComplete: isFirstRunComplete() && hasAnyUser() });
  } catch (err) {
    return handleApiError(err);
  }
}
