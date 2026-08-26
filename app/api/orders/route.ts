import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { orderFilterSchema, orderInputSchema } from "@/lib/validation/order";
import { createOrder, listOrders } from "@/lib/db/repositories/orders";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const filter = orderFilterSchema.parse(Object.fromEntries(searchParams.entries()));
    const { rows, total, totals } = listOrders(filter);
    return ok({ orders: rows, total, totals, page: filter.page, pageSize: filter.pageSize });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = orderInputSchema.parse(await req.json());
    const { order, warnings } = createOrder(input, user.id);
    return ok({ order, warnings }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
