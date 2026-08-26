import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { distinctItems } from "@/lib/db/repositories/orders";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

const DEFAULT_ITEMS = ["Ring", "Chain", "Bracelet", "Necklace", "Earrings", "Other"];

/** Item options for the Item combobox (section 7: examples + free text
 * allowed). Merges the built-in suggestions with whatever custom item
 * names the business has actually typed in before, so the list grows with
 * real usage instead of being hard-coded. */
export async function GET() {
  try {
    await requireUser();
    const used = distinctItems();
    const merged = Array.from(new Set([...DEFAULT_ITEMS, ...used])).sort();
    return ok({ items: merged });
  } catch (err) {
    return handleApiError(err);
  }
}
