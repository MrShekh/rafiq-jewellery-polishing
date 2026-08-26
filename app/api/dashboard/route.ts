import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getTodaySummary, getMonthlySummary, getRecentOrders } from "@/lib/db/repositories/dashboard";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({
      today: getTodaySummary(),
      monthly: getMonthlySummary(),
      recentOrders: getRecentOrders(10),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
