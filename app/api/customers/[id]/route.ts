import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { customerUpdateSchema } from "@/lib/validation/customer";
import { getCustomerById, updateCustomer, softDeleteCustomer } from "@/lib/db/repositories/customers";

export const dynamic = "force-dynamic";

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const customer = await getCustomerById(user.id, params.id);
    return ok({ customer });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const body = customerUpdateSchema.parse({ ...(await req.json()), id: params.id });
    const customer = await updateCustomer(user.id, params.id, body);
    return ok({ customer });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    await softDeleteCustomer(user.id, params.id);
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
