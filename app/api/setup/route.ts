import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { hasAnyUser, createAdminUser } from "@/lib/db/repositories/users";
import { setBusinessProfile } from "@/lib/db/repositories/settings";
import { createSession } from "@/lib/auth/session";
import { validatePasswordStrength } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const setupSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(200),
  businessAddress: z.string().trim().max(500).optional().default(""),
  businessPhone: z.string().trim().max(30).optional().default(""),
  adminUsername: z.string().trim().min(3, "Username must be at least 3 characters").max(60),
  adminDisplayName: z.string().trim().min(1, "Your name is required").max(120),
  adminPassword: z.string().min(8),
});

export async function GET() {
  const firstRunComplete = await hasAnyUser();
  return ok({ firstRunComplete });
}

/** First-launch wizard: Welcome → Business Profile → Admin Account → Ready.
 *  Refuses if ANY user already exists in MongoDB (setup already done). */
export async function POST(req: NextRequest) {
  try {
    if (await hasAnyUser()) {
      return ok({ error: "Setup has already been completed." }, 409);
    }

    const body = setupSchema.parse(await req.json());

    const passwordIssue = validatePasswordStrength(body.adminPassword);
    if (passwordIssue) {
      return ok({ error: passwordIssue, fieldErrors: { adminPassword: [passwordIssue] } }, 400);
    }

    const admin = await createAdminUser({
      username: body.adminUsername,
      displayName: body.adminDisplayName,
      password: body.adminPassword,
    });

    await setBusinessProfile(admin._id, {
      name: body.businessName,
      address: body.businessAddress,
      phone: body.businessPhone,
    });

    await createSession(admin._id);

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
