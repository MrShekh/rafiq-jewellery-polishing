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

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [business, precision, theme] = await Promise.all([
      getBusinessProfile(user.id),
      getPrecisionPolicy(user.id),
      getSetting(user.id, SETTINGS_KEYS.theme),
    ]);
    return ok({
      business,
      precision,
      theme: theme ?? "system",
      appVersion: APP_VERSION,
      cloudSyncConfigured: true, // MongoDB IS the database now
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
    const user = await requireUser();
    const body = updateSchema.parse(await req.json());

    const ops: Promise<void>[] = [];
    if (body.business) ops.push(setBusinessProfile(user.id, body.business));
    if (body.precision) {
      if (body.precision.weight !== undefined) ops.push(setSetting(user.id, SETTINGS_KEYS.precisionWeight, String(body.precision.weight)));
      if (body.precision.touch !== undefined) ops.push(setSetting(user.id, SETTINGS_KEYS.precisionTouch, String(body.precision.touch)));
      if (body.precision.fine !== undefined) ops.push(setSetting(user.id, SETTINGS_KEYS.precisionFine, String(body.precision.fine)));
    }
    if (body.theme) ops.push(setSetting(user.id, SETTINGS_KEYS.theme, body.theme));
    await Promise.all(ops);

    return ok({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
