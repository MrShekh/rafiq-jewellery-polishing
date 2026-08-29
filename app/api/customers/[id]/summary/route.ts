import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { getCustomerById, getCustomerSummary, getCustomerOrderHistory } from "@/lib/db/repositories/customers";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const [customer, summary, history] = await Promise.all([
      getCustomerById(user.id, params.id),
      getCustomerSummary(user.id, params.id),
      getCustomerOrderHistory(user.id, params.id),
    ]);
    return ok({ customer, summary, history });
  } catch (err) {
    return handleApiError(err);
  }
}
