import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { customerInputSchema } from "@/lib/validation/customer";
import { createCustomer, listCustomers } from "@/lib/db/repositories/customers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? undefined;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const list = await listCustomers(user.id, { search, includeInactive });
    return ok({ customers: list });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = customerInputSchema.parse(await req.json());
    const customer = await createCustomer(user.id, input);
    return ok({ customer }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
