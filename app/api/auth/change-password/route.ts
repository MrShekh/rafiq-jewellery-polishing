import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import { verifyPassword, validatePasswordStrength } from "@/lib/auth/password";
import { findUserById, updateUserPassword } from "@/lib/db/repositories/users";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());

    const record = await findUserById(user.id);
    if (!record) return ok({ error: "Account not found." }, 404);

    const valid = await verifyPassword(body.currentPassword, record.passwordHash);
    if (!valid) return ok({ error: "Current password is incorrect." }, 400);

    const issue = validatePasswordStrength(body.newPassword);
    if (issue) return ok({ error: issue }, 400);

    await updateUserPassword(user.id, body.newPassword);
    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
