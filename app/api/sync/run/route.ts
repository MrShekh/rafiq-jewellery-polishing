import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireUser();
    return ok({ attempted: true, succeeded: 0, failed: 0 });
  } catch (err) {
    return handleApiError(err);
  }
}
