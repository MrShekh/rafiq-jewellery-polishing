import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { requireUser } from "@/lib/auth/session";
import {
  getBusinessProfile,
  setBusinessProfile,
  getPrecisionPolicy,
  setSetting,
  SETTINGS_KEYS,
  getSetting,
} from "@/lib/db/repositories/settings";
import { APP_VERSION } from "@/lib/version";
import { isCloudSyncConfigured } from "@/lib/sync/mongo";

// Always dynamic: every route here reads the session cookie and/or hits
// SQLite directly, so there is nothing safe to prerender or cache.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    return ok({
      business: getBusinessProfile(),
      precision: getPrecisionPolicy(),
      theme: getSetting(SETTINGS_KEYS.theme) ?? "system",
      appVersion: APP_VERSION,
      cloudSyncConfigured: isCloudSyncConfigured(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const updateSchema = z.object({
  business: z
    .object({
      name: z.string().trim().max(200).optional(),
      address: z.string().trim().max(500).optional(),
      phone: z.string().trim().max(30).optional(),
    })
    .optional(),
  precision: z
    .object({
      weight: z.number().int().min(0).max(6).optional(),
      touch: z.number().int().min(0).max(6).optional(),
      fine: z.number().int().min(0).max(6).optional(),
    })
    .optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireUser();
    const body = updateSchema.parse(await req.json());

    if (body.business) setBusinessProfile(body.business);
    if (body.precision) {
      if (body.precision.weight !== undefined) setSetting(SETTINGS_KEYS.precisionWeight, String(body.precision.weight));
      if (body.precision.touch !== undefined) setSetting(SETTINGS_KEYS.precisionTouch, String(body.precision.touch));
      if (body.precision.fine !== undefined) setSetting(SETTINGS_KEYS.precisionFine, String(body.precision.fine));
    }
    if (body.theme) setSetting(SETTINGS_KEYS.theme, body.theme);

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
