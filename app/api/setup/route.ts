import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { createAdminUser } from "@/lib/db/repositories/users";
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
  return ok({ firstRunComplete: true });
}

/**
 * Sign up: create a new user account with their own business profile.
 * Multiple independent clients can each create their own account.
 * All data (orders, customers) is scoped by userId so each account
 * only ever sees their own data.
 */
export async function POST(req: NextRequest) {
  try {
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

    return ok({ success: true, linkedExistingBusiness: false });
  } catch (err) {
    return handleApiError(err);
  }
}

