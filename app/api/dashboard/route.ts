import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getTodaySummary, getMonthlySummary, getRecentOrders } from "@/lib/db/repositories/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [today, monthly, recentOrders] = await Promise.all([
      getTodaySummary(user.id),
      getMonthlySummary(user.id),
      getRecentOrders(user.id, 10),
    ]);
    return ok({ today, monthly, recentOrders });
  } catch (err) {
    return handleApiError(err);
  }
}
