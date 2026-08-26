import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { orderUpdateSchema } from "@/lib/validation/order";
import { getOrderById, updateOrder, softDeleteOrder } from "@/lib/db/repositories/orders";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireUser();
    return ok({ order: getOrderById(params.id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const body = orderUpdateSchema.parse({ ...(await req.json()), id: params.id });
    const { order, warnings } = updateOrder(params.id, body, user.id);
    return ok({ order, warnings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    softDeleteOrder(params.id, user.id);
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
