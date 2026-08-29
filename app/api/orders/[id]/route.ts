import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { orderUpdateSchema } from "@/lib/validation/order";
import { getOrderById, updateOrder, softDeleteOrder } from "@/lib/db/repositories/orders";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    return ok({ order: await getOrderById(user.id, params.id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const body = orderUpdateSchema.parse({ ...(await req.json()), id: params.id });
    const { order, warnings } = await updateOrder(user.id, params.id, body);
    return ok({ order, warnings });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    await softDeleteOrder(user.id, params.id);
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
