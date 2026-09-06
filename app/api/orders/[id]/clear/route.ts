import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { orderClearSchema } from "@/lib/validation/order";
import { clearOrderFine } from "@/lib/db/repositories/orders";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const body = orderClearSchema.parse(await req.json());
    const { order, warnings } = await clearOrderFine(user.id, params.id, body.amount);
    return ok({ order, warnings });
  } catch (err) {
    return handleApiError(err);
  }
}
