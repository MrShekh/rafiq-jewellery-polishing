import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { hasAnyUser, createAdminUser } from "@/lib/db/repositories/users";
import { setBusinessProfile, markFirstRunComplete, isFirstRunComplete } from "@/lib/db/repositories/settings";
import { createSession } from "@/lib/auth/session";
import { validatePasswordStrength } from "@/lib/auth/password";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
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
  return ok({ firstRunComplete: isFirstRunComplete() && hasAnyUser() });
}

/** First-launch wizard (section 42): Welcome -> Business Profile -> Admin
 * Account -> Ready. Runs once; refuses if setup has already happened. */
export async function POST(req: NextRequest) {
  try {
    if (hasAnyUser()) {
      return ok({ error: "Setup has already been completed on this computer." }, 409);
    }

    const body = setupSchema.parse(await req.json());

    const passwordIssue = validatePasswordStrength(body.adminPassword);
    if (passwordIssue) {
      return ok({ error: passwordIssue, fieldErrors: { adminPassword: [passwordIssue] } }, 400);
    }

    setBusinessProfile({
      name: body.businessName,
      address: body.businessAddress,
      phone: body.businessPhone,
    });

    const admin = await createAdminUser({
      username: body.adminUsername,
      displayName: body.adminDisplayName,
      password: body.adminPassword,
    });

    markFirstRunComplete();
    await createSession(admin.id);

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
