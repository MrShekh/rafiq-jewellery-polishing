import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { distinctItems } from "@/lib/db/repositories/orders";

export const dynamic = "force-dynamic";

const DEFAULT_ITEMS = ["Ring", "Chain", "Bracelet", "Necklace", "Earrings", "Other"];

export async function GET() {
  try {
    const user = await requireUser();
    const used = await distinctItems(user.id);
    const merged = Array.from(new Set([...DEFAULT_ITEMS, ...used])).sort();
    return ok({ items: merged });
  } catch (err) {
    return handleApiError(err);
  }
}
