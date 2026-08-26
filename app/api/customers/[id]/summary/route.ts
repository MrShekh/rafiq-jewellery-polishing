import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getCustomerById, getCustomerSummary, getCustomerOrderHistory } from "@/lib/db/repositories/customers";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const customer = getCustomerById(params.id);
    const summary = getCustomerSummary(params.id);
    const history = getCustomerOrderHistory(params.id);
    return ok({ customer, summary, history });
  } catch (err) {
    return handleApiError(err);
  }
}
