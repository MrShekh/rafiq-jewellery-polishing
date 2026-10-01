import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getTodaySummary, getMonthlySummary, getRecentOrders } from "@/lib/db/repositories/dashboard";
import { businessDateRanges } from "@/lib/business-date";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const [today, monthly, recentOrders] = await Promise.all([
      getTodaySummary(user.id, now),
      getMonthlySummary(user.id, now),
      getRecentOrders(user.id, 10),
    ]);
    return ok({ today, monthly, recentOrders, periods: businessDateRanges(now) });
  } catch (err) {
    return handleApiError(err);
  }
}
