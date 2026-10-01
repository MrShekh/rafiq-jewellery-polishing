import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handleApiError, ok } from "@/lib/api/respond";
import { clearCustomerBalance, getCustomerSettlement } from "@/lib/db/repositories/customer-settlements";

export const dynamic = "force-dynamic";
interface Params { params: { id: string } }
const inputSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    return ok(await getCustomerSettlement(user.id, params.id));
  } catch (err) { return handleApiError(err); }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { token } = inputSchema.parse(await req.json());
    return ok(await clearCustomerBalance(user.id, params.id, token));
  } catch (err) { return handleApiError(err); }
}
