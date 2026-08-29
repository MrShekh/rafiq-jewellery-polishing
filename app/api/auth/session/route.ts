import { handleApiError, ok } from "@/lib/api/respond";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/db/repositories/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [user, firstRunComplete] = await Promise.all([
      getCurrentUser(),
      hasAnyUser(),
    ]);
    return ok({ user, firstRunComplete });
  } catch (err) {
    return handleApiError(err);
  }
}
