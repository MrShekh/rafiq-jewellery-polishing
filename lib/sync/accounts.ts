import { getMongoDb, isCloudSyncConfigured } from "@/lib/sync/mongo";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logger } from "@/lib/logger";

/**
 * Cross-device business identity linking.
 *
 * The rest of the sync system (lib/sync/engine.ts, lib/sync/cloud.ts) scopes
 * every record to a `tenantId` read from local SQLite settings
 * (lib/db/repositories/settings.ts:getTenantId). Left alone, every fresh
 * install/first-run generates its own random tenantId - so "log into web,
 * then log into desktop with the same username/password" produces two
 * unrelated tenants that never see each other's data, even though the
 * owner reasonably expects a shared account to mean shared data.
 *
 * We cannot use the username itself as the shared identifier (the brief
 * explicitly warns against this): two unrelated businesses picking the
 * same admin username would otherwise be merged into one tenant and leak
 * data between them. Instead, first-run setup (app/api/setup/route.ts)
 * calls `findLinkableAccount` with the plaintext password it already has
 * server-side (same trust boundary as a normal login): only a username
 * *and matching password* adopts an existing tenantId. A same-username,
 * different-password setup is treated as a distinct, unrelated business
 * and keeps its own new tenantId - this is what actually prevents
 * cross-tenant leakage (section 7/8 of the brief), not username matching
 * alone.
 *
 * This is a deliberately small, additive Mongo collection ("accounts") -
 * it does not replace the existing per-device `users` table or session
 * auth, which remain fully local and fully offline-capable. It only
 * answers one question at setup time: "has this exact username+password
 * already registered a business elsewhere?" When Mongo is unreachable
 * (first run while offline), setup proceeds exactly as it always has -
 * with a fresh local tenantId - because the app must never require
 * internet to finish first-run setup.
 */

interface AccountDoc {
  _id: string; // usernameNormalized
  usernameNormalized: string;
  passwordHash: string;
  tenantId: string;
  businessName: string;
  createdAt: string;
}

function accountsCollection() {
  return getMongoDb().then((db) => db.collection<AccountDoc>("accounts"));
}

export interface LinkResult {
  tenantId: string;
  linkedExistingBusiness: boolean;
}

/**
 * Called once, during first-run setup, after the local admin user has been
 * created. Returns the tenantId this device should use:
 *  - an existing tenantId, if a cloud account with this exact
 *    username+password already exists (linkedExistingBusiness: true)
 *  - `ownTenantId` unchanged, otherwise - and in that case this function
 *    also registers `ownTenantId` under this username so a *future* device
 *    setting up with the same credentials links to it.
 *
 * Never throws: any Mongo failure (not configured, offline, timeout) is
 * treated as "no existing account found" so first-run setup always
 * succeeds locally, offline-first, exactly as it did before this existed.
 */
export async function linkOrRegisterAccount(
  username: string,
  plainPassword: string,
  ownTenantId: string,
  businessName: string,
): Promise<LinkResult> {
  if (!isCloudSyncConfigured()) {
    return { tenantId: ownTenantId, linkedExistingBusiness: false };
  }

  const usernameNormalized = username.toLowerCase().trim();

  try {
    const collection = await accountsCollection();
    const existing = await collection.findOne({ usernameNormalized });

    if (existing) {
      const passwordMatches = await verifyPassword(plainPassword, existing.passwordHash);
      if (passwordMatches) {
        logger.info("First-run setup linked to an existing cloud business", { usernameNormalized });
        return { tenantId: existing.tenantId, linkedExistingBusiness: true };
      }
      // Same username, different password: a different, unrelated business.
      // Do not touch the existing account record; this device keeps its own
      // new tenantId and is left unregistered under this username (it would
      // be ambiguous which business a bare username should resolve to).
      logger.warn("First-run setup: username already registered to a different account; treating as separate business", {
        usernameNormalized,
      });
      return { tenantId: ownTenantId, linkedExistingBusiness: false };
    }

    const passwordHash = await hashPassword(plainPassword);
    await collection.insertOne({
      _id: usernameNormalized,
      usernameNormalized,
      passwordHash,
      tenantId: ownTenantId,
      businessName,
      createdAt: new Date().toISOString(),
    });
    return { tenantId: ownTenantId, linkedExistingBusiness: false };
  } catch (err) {
    logger.warn("Account linking skipped (cloud unreachable during first-run setup)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { tenantId: ownTenantId, linkedExistingBusiness: false };
  }
}
