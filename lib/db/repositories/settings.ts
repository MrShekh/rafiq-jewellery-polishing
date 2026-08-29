import { nanoid } from "nanoid";
import { col } from "@/lib/db/mongo";
import { type SettingDoc } from "@/lib/db/types";
import { DEFAULT_PRECISION, type FormulaVersion, type PrecisionPolicy } from "@/lib/calculations";

export const SETTINGS_KEYS = {
  businessName: "business.name",
  businessAddress: "business.address",
  businessPhone: "business.phone",
  businessLogoPath: "business.logo_path",
  precisionWeight: "calc.precision_weight",
  precisionTouch: "calc.precision_touch",
  precisionFine: "calc.precision_fine",
  formulaVersion: "calc.formula_version",
  theme: "appearance.theme",
  firstRunComplete: "app.first_run_complete",
} as const;

export async function getSetting(userId: string, key: string): Promise<string | null> {
  const c = await col<SettingDoc>("settings");
  const doc = await c.findOne({ userId, key });
  return doc?.value ?? null;
}

export async function setSetting(userId: string, key: string, value: string) {
  const c = await col<SettingDoc>("settings");
  await c.updateOne(
    { userId, key },
    {
      $set: { value, updatedAt: new Date().toISOString() },
      $setOnInsert: { _id: nanoid() },
    },
    { upsert: true },
  );
}

export async function getAllSettings(userId: string): Promise<Record<string, string>> {
  const c = await col<SettingDoc>("settings");
  const rows = await c.find({ userId }).toArray();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getPrecisionPolicy(userId: string): Promise<PrecisionPolicy> {
  const [w, t, f] = await Promise.all([
    getSetting(userId, SETTINGS_KEYS.precisionWeight),
    getSetting(userId, SETTINGS_KEYS.precisionTouch),
    getSetting(userId, SETTINGS_KEYS.precisionFine),
  ]);
  const weight = Number(w ?? DEFAULT_PRECISION.weight);
  const touch = Number(t ?? DEFAULT_PRECISION.touch);
  const fine = Number(f ?? DEFAULT_PRECISION.fine);
  return {
    weight: Number.isFinite(weight) ? weight : DEFAULT_PRECISION.weight,
    touch: Number.isFinite(touch) ? touch : DEFAULT_PRECISION.touch,
    fine: Number.isFinite(fine) ? fine : DEFAULT_PRECISION.fine,
  };
}

export async function getFormulaVersion(userId: string): Promise<FormulaVersion> {
  return ((await getSetting(userId, SETTINGS_KEYS.formulaVersion)) as FormulaVersion) ?? "v1-standard";
}

export interface BusinessProfile {
  name: string;
  address: string;
  phone: string;
  logoPath: string | null;
}

export async function getBusinessProfile(userId: string): Promise<BusinessProfile> {
  const [name, address, phone, logoPath] = await Promise.all([
    getSetting(userId, SETTINGS_KEYS.businessName),
    getSetting(userId, SETTINGS_KEYS.businessAddress),
    getSetting(userId, SETTINGS_KEYS.businessPhone),
    getSetting(userId, SETTINGS_KEYS.businessLogoPath),
  ]);
  return {
    name: name ?? "",
    address: address ?? "",
    phone: phone ?? "",
    logoPath: logoPath ?? null,
  };
}

export async function setBusinessProfile(userId: string, profile: Partial<BusinessProfile>) {
  const ops: Promise<void>[] = [];
  if (profile.name !== undefined) ops.push(setSetting(userId, SETTINGS_KEYS.businessName, profile.name));
  if (profile.address !== undefined) ops.push(setSetting(userId, SETTINGS_KEYS.businessAddress, profile.address));
  if (profile.phone !== undefined) ops.push(setSetting(userId, SETTINGS_KEYS.businessPhone, profile.phone));
  if (profile.logoPath != null) ops.push(setSetting(userId, SETTINGS_KEYS.businessLogoPath, profile.logoPath));
  await Promise.all(ops);
}

export async function isFirstRunComplete(): Promise<boolean> {
  // First run is complete globally once any user exists in the DB.
  const { hasAnyUser } = await import("@/lib/db/repositories/users");
  return hasAnyUser();
}

export async function markFirstRunComplete(_userId: string) {
  // No-op: first run completion is inferred from user existence now.
}
