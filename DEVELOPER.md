# Developer Notes — Web ↔ Desktop Sync Fix

This file documents one piece of work: fixing web-to-desktop (and desktop-to-web)
data synchronization, done on top of the existing v1.0.9 codebase. It records
what was asked for, what was actually wrong, and exactly what changed, so the
next person touching this code doesn't have to re-derive any of it.

## What was asked

> The same username/password logs into both the web app and the desktop EXE,
> but they don't share data. Example: create a customer on the web app → it's
> in MongoDB → open the desktop EXE, log in with the same account → the
> desktop shows an empty database.
>
> Audit the existing codebase first. Don't rewrite the architecture, don't
> remove SQLite/MongoDB/Drizzle, don't introduce Firebase, reuse existing
> auth/schemas/repositories/API routes wherever possible. Then implement a
> real offline-first sync engine: push, pull, initial sync on first install,
> business/tenant isolation, universal IDs, conflict handling, retry,
> automatic background sync (not just a manual button), a sync status UI,
> and keep MongoDB credentials out of the desktop app. Report root cause,
> architecture before/after, files changed, and how to test - don't just
> say "sync implemented."
>
> Then, later in the same session: "I want to build this production level,
> I have to deliver this to client" - i.e. don't just make the code look
> right, actually verify it works.

## What was actually wrong (root cause)

The sync **engine** itself (`lib/sync/engine.ts`) was already well-built:
transactional outbox (`sync_queue`), upsert-by-id, retry/backoff, tenant
metadata columns - all present and already tested. The bug was everything
*around* it:

1. **Sync only ever ran when a human clicked "Sync now."**
   `startPeriodicSync()` existed but was never called from anywhere -
   not on server startup, not on login, not on reconnect.
2. **Every install generates its own random `tenantId`**
   (`lib/db/repositories/settings.ts:getTenantId`). The web deployment and
   each desktop install are fully independent SQLite databases with fully
   independent local `users` tables. "Same username/password" on both just
   means two unrelated accounts that happen to share a password - each
   tagged with a different random tenant, and every Mongo query is
   filtered by tenant. Nothing crossed over unless someone manually copied
   the "Sync ID" between two Settings screens.
3. **No initial pull on first install.** Even with matching tenant IDs, a
   fresh SQLite never proactively pulled existing cloud data.
4. **(Separate, serious) MongoDB Atlas credentials were shipped inside the
   packaged desktop EXE.** `scripts/copy-standalone-assets.mjs` copied the
   developer's `.env` (real `MONGODB_URI`) straight into the installer's
   `resources/app-server/pkg/.env` - unencrypted, readable by anyone with
   the installed app.
5. **(Found while verifying, unrelated to sync)** `better-sqlite3@13.0.3`
   requires Node ≥22, but the project declared no `engines` field and no
   `.nvmrc`. On an older Node, the native binding doesn't just error - it
   **segfaults the process**. This would silently crash the web deployment
   on the wrong Node version, with a stack trace that gives no hint why.
6. **(Found while verifying, unrelated to sync)** The DB/sync test suite
   (`vitest.db.config.mts`) runs multiple test files in one shared worker
   process (`isolate: false`, intentionally - so the native SQLite addon
   only loads into one V8 context per process). That meant the *second*
   test file's `USER_DATA_PATH` override was silently ignored - it reused
   the first file's already-open connection, cross-contaminating test
   state, and (on Windows) leaving a locked file handle that made cleanup
   fail with `EPERM`.

## What changed

No SQLite schema changes, no data migration - every fix reuses existing
tables/columns/repositories.

| File | Change |
|---|---|
| `lib/sync/cloud.ts` *(new)* | Shared, tenant-scoped Mongo push/pull primitives. Single source of truth for "how a record is shaped in Mongo," used by both the engine and the new HTTP endpoints. |
| `lib/sync/accounts.ts` *(new)* | Password-verified cross-device business linking (see below). |
| `lib/sync/engine.ts` | Rebuilt on `cloud.ts`. Pull is now per-record fault-isolated (one bad row no longer aborts the rest of the batch) and disambiguates `orderNumber` collisions instead of losing data or crashing. |
| `instrumentation.ts` *(new)* | Next.js server-startup hook - calls `startPeriodicSync()` once per server process. This is what actually turns the engine's dormant periodic-sync code on, for both the web deployment and the Electron-spawned local server. |
| `components/providers/sync-trigger.tsx` *(new)* | Client-side: triggers a sync on app-shell mount and on the browser `online` event. |
| `app/api/sync/push/route.ts`, `app/api/sync/pull/route.ts` *(new)* | The literal `POST /api/sync/push` / `GET /api/sync/pull?since=` endpoints from the spec - authenticated, tenant-scoped, idempotent. The background engine still talks to Mongo in-process (same server, no reason to add a network hop); these exist as the independently-callable, spec-shaped version of the same operation. |
| `app/api/setup/route.ts` | After first-run creates the local admin, calls `linkOrRegisterAccount` and runs an initial `runSyncCycle()` before returning "done." |
| `app/first-run/page.tsx`, `app/login/page.tsx` | UI copy for the "we found your existing business" case; fire-and-forget sync call right after login. |
| `lib/db/repositories/settings.ts` | Added `setTenantId()`. |
| `lib/db/client.ts` | Added `__resetConnectionForTests()` (test-only) to fix the cross-file DB contamination described above. |
| `scripts/copy-standalone-assets.mjs` | Packaged desktop build no longer inherits `.env`. Ships credentials only from an explicit, separate `.env.desktop` opt-in file. |
| `.env.example`, `README.md` | Documented the `.env.desktop` opt-in, the account-linking behavior, and the automatic sync triggers. |
| `package.json` | Added `"engines": { "node": ">=22.12.0" }`. |
| `.nvmrc` *(new)* | Pinned to `22.12.0`. |
| `tests/sync.test.ts`, `tests/db.test.ts` | Fixed the cross-file DB isolation bug; added 4 new tests covering pull-insert, the last-write-wins conflict rule, and `orderNumber` collision handling. |

### How the business-linking actually works (`lib/sync/accounts.ts`)

The brief explicitly warns against using username alone as a shared
business identifier (two unrelated businesses could pick the same admin
username). So linking is **password-verified**, not username-only:

- First-run setup already receives the admin's plaintext password
  server-side (same trust boundary as a normal login).
- It's checked against a small, additive Mongo `accounts` collection
  (`{ usernameNormalized, passwordHash, tenantId, businessName }`).
- **Username + matching password** → this device adopts the existing
  `tenantId` and immediately pulls that business's data. This is what
  makes "log into web, then install desktop with the same login" work
  with zero manual steps.
- **Username exists, password doesn't match** → treated as a *different*,
  unrelated business; keeps its own new `tenantId`. This is the actual
  isolation guarantee (verified live, see below) - not the username match
  itself.
- Mongo unreachable during setup → falls back to a fresh local `tenantId`,
  exactly like before. First-run setup never blocks on the network.
- The existing manual "Sync ID" field in Settings is untouched and still
  works, for relinking/edge cases.

## How this was actually verified (not just read)

Everything below was *run*, not inferred from reading the code:

1. **`npm run typecheck` / `npm run lint`** - clean.
2. **`npm test` (20 tests) and `npm run test:db` (13 tests)** - all passing,
   including 4 new tests for the pull/conflict logic. (These initially
   couldn't run at all - see "Two bugs found only by testing" below.)
3. **`npm run build`** - production Next.js build succeeds; postbuild log
   confirms the packaged desktop path no longer inherits `.env`
   (`"no .env.desktop found - packaged desktop app will run fully
   offline"`).
4. **A real four-"device" end-to-end run against the actual MongoDB Atlas
   cluster in `.env`** (`next dev` on four ports, four separate
   `USER_DATA_PATH` temp directories, driven with `curl`):
   - Device A: first-run setup with a throwaway test account → customer
     created → pushed to Atlas.
   - Device B: fresh install, first-run setup with the **same**
     username/password → `linkedExistingBusiness: true`, same `tenantId`
     as A, and **the customer created on A was already present in B's
     `/api/customers` response** on a brand-new SQLite. This is the exact
     bug reported, confirmed fixed.
   - Reverse direction: order created on B → pushed → pulled by A →
     appeared correctly, with `createdBy`/`updatedBy` safely nulled since
     B's user ID doesn't exist in A's local `users` table.
   - Device C: unrelated business, different username/password → own new
     `tenantId`, **zero** cross-tenant data visible.
   - Device D: same username as A/B, **wrong** password → correctly
     refused to link, own new `tenantId`, no data leak.
   - All test data (customers/orders/accounts docs) was deleted from the
     Atlas cluster afterward; verified zero remaining.

### Two bugs found only by actually running things (not sync-related, but real)

Static analysis (typecheck/lint) doesn't catch either of these - they only
showed up once tests were actually executed:

- **`better-sqlite3` requires Node ≥22**, undeclared anywhere in the
  project. On an older Node it doesn't error, it segfaults the process.
  Fixed by adding `engines`/`.nvmrc`. If your CI or deploy target runs an
  older Node, this will crash the web deployment on startup - check it.
- **Cross-test-file DB contamination** in `vitest.db.config.mts`'s shared
  worker process, which also caused Windows `EPERM` cleanup failures.
  Fixed via `__resetConnectionForTests()`.

Neither is introduced by the sync work, but both were sitting there
un-caught because the test suite had apparently never successfully run to
completion in this environment before now.

## Remaining limitations (documented, not hidden)

- Local business-profile fields (name/address/phone) aren't re-pulled when
  a device links to an existing cloud business - cosmetic only.
- Conflict resolution is last-write-wins by `updatedAt` timestamp - no
  version-vector/manual-merge UI. Matches the brief's "reasonable initial
  strategy," not a full CRDT.
- If the already-built `release/win-unpacked/...` folder in this repo was
  ever handed to a real user before this fix, it had live Atlas
  credentials on disk - rotate that credential before shipping the next
  installer, built from this fixed pipeline.
- The packaged-EXE path (`electron:pack` → install → run) was not run
  end-to-end in this session (no Windows GUI available here) - the web/API
  layer underneath it was, exhaustively, against real Mongo. Recommend one
  manual pass: `.env.desktop` → `electron:pack:dir` → install → repeat the
  same-credentials fresh-install test above.
