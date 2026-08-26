import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { customerInputSchema } from "@/lib/validation/customer";
import { createCustomer, listCustomers } from "@/lib/db/repositories/customers";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? undefined;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const list = listCustomers({ search, includeInactive });
    return ok({ customers: list });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = customerInputSchema.parse(await req.json());
    const customer = createCustomer(input, user.id);
    return ok({ customer }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
