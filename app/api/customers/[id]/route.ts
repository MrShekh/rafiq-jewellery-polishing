import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { customerUpdateSchema } from "@/lib/validation/customer";
import { getCustomerById, updateCustomer, softDeleteCustomer } from "@/lib/db/repositories/customers";

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
    return ok({ customer });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const body = customerUpdateSchema.parse({ ...(await req.json()), id: params.id });
    const customer = updateCustomer(params.id, body, user.id);
    return ok({ customer });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    softDeleteCustomer(params.id, user.id);
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
