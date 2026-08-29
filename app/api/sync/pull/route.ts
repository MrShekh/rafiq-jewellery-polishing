import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({
      customers: [],
      orders: [],
      pulledAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
