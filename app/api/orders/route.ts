import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { orderFilterSchema, orderInputSchema } from "@/lib/validation/order";
import { createOrder, listOrders } from "@/lib/db/repositories/orders";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const filter = orderFilterSchema.parse(Object.fromEntries(searchParams.entries()));
    const { rows, total, totals } = await listOrders(user.id, filter);
    return ok({ orders: rows, total, totals, page: filter.page, pageSize: filter.pageSize });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = orderInputSchema.parse(await req.json());
    const { order, warnings } = await createOrder(user.id, input);
    return ok({ order, warnings }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
