import { eq } from "drizzle-orm";

import { settings } from "@/db/schema";
import { db } from "@/lib/db/client";
import { DEFAULT_PRECISION, type FormulaVersion, type PrecisionPolicy } from "@/lib/calculations";

/**
 * Typed accessors over the flexible `settings` key/value table. Business
 * profile, precision policy, formula version, and appearance preference
 * all live here so Settings screen changes take effect immediately without
 * a schema migration.
 */

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
  mongoConfigured: "sync.mongo_configured_hint",
} as const;

export function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
    .run();
}

export function getAllSettings(): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getPrecisionPolicy(): PrecisionPolicy {
  const weight = Number(getSetting(SETTINGS_KEYS.precisionWeight) ?? DEFAULT_PRECISION.weight);
  const touch = Number(getSetting(SETTINGS_KEYS.precisionTouch) ?? DEFAULT_PRECISION.touch);
  const fine = Number(getSetting(SETTINGS_KEYS.precisionFine) ?? DEFAULT_PRECISION.fine);
  return {
    weight: Number.isFinite(weight) ? weight : DEFAULT_PRECISION.weight,
    touch: Number.isFinite(touch) ? touch : DEFAULT_PRECISION.touch,
    fine: Number.isFinite(fine) ? fine : DEFAULT_PRECISION.fine,
  };
}

export function getFormulaVersion(): FormulaVersion {
  return (getSetting(SETTINGS_KEYS.formulaVersion) as FormulaVersion) ?? "v1-standard";
}

export interface BusinessProfile {
  name: string;
  address: string;
  phone: string;
  logoPath: string | null;
}

export function getBusinessProfile(): BusinessProfile {
  return {
    name: getSetting(SETTINGS_KEYS.businessName) ?? "",
    address: getSetting(SETTINGS_KEYS.businessAddress) ?? "",
    phone: getSetting(SETTINGS_KEYS.businessPhone) ?? "",
    logoPath: getSetting(SETTINGS_KEYS.businessLogoPath),
  };
}

export function setBusinessProfile(profile: Partial<BusinessProfile>) {
  if (profile.name !== undefined) setSetting(SETTINGS_KEYS.businessName, profile.name);
  if (profile.address !== undefined) setSetting(SETTINGS_KEYS.businessAddress, profile.address);
  if (profile.phone !== undefined) setSetting(SETTINGS_KEYS.businessPhone, profile.phone);
  if (profile.logoPath !== undefined && profile.logoPath !== null) {
    setSetting(SETTINGS_KEYS.businessLogoPath, profile.logoPath);
  }
}

export function isFirstRunComplete(): boolean {
  return getSetting(SETTINGS_KEYS.firstRunComplete) === "true";
}

export function markFirstRunComplete() {
  setSetting(SETTINGS_KEYS.firstRunComplete, "true");
}
