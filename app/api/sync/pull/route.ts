import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { isCloudSyncConfigured } from "@/lib/sync/mongo";
import { pullChanges } from "@/lib/sync/cloud";

// Always dynamic: reads the session cookie and talks to Mongo per request.
export const dynamic = "force-dynamic";

/**
 * Cloud -> desktop pull endpoint (brief section 5).
 *
 * `?since=<ISO timestamp>` returns only customers/orders updated after that
 * point for the caller's own tenant (never another tenant's - that scoping
 * is enforced server-side in lib/sync/cloud.ts:pullChanges, not by
 * anything the client sends). Omit `since` for the very first pull, which
 * returns everything for the tenant (brief section 6, "Initial Sync").
 *
 * The automatic background engine (lib/sync/engine.ts) calls
 * pullChanges() directly in-process rather than through this HTTP route,
 * for the same reason runSyncCycle drains its own outbox in-process: it's
 * the same server, so a network hop would only add latency. This route is
 * the independently callable version of the same operation - e.g. for a
 * future second desktop client, tooling, or diagnostics.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();

    if (!isCloudSyncConfigured()) {
      return ok({ error: "Cloud sync is not configured on this server." }, 503);
    }

    const since = req.nextUrl.searchParams.get("since");
    const changes = await pullChanges(since && since.trim().length > 0 ? since : null);

    return ok({
      customers: changes.customers,
      orders: changes.orders,
      pulledAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
