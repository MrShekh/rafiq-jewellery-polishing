# Jewellery Polishing Manager

An offline-first desktop application for jewellery polishing workshops: order
registry, customers, dashboard, and settings, running locally on Windows with
optional cloud backup/sync to MongoDB Atlas. Built with Next.js + Electron +
SQLite (Drizzle ORM), following the brief's priority order throughout:
**data safety > correctness > offline reliability > usability > performance >
visual polish**.

## What's implemented

- **Order Registry** (the default landing page after login) - Excel-like
  editable grid: click/Tab/Enter/Arrow-key navigation, inline editing, sticky
  header and totals row, search/filter/sort, column resizing, pagination,
  Excel export, print.
- Precise decimal math (decimal.js, never native floats) for Loss and Fine
  Total, with a configurable rounding precision policy. Weight-out-exceeds-
  weight-in requires explicit confirmation; negative Loss shows a warning
  toast rather than being silently accepted.
- **Customers**: CRUD, search, per-customer summary and order history.
- **Dashboard**: today's summary, monthly summary, recent orders.
- **Settings**: profile/password, business profile, appearance
  (light/dark/system), data (backup/restore/export), cloud sync status, and
  app version/updates.
- **Local-first storage**: SQLite via Drizzle ORM (WAL mode), with a
  transactional outbox (`sync_queue`) feeding an optional MongoDB Atlas sync
  engine - the app is fully usable with zero internet connectivity. Sync runs
  automatically (server startup via `instrumentation.ts`, every 60s while
  running, right after login, and on network reconnect) as well as on-demand
  via Settings > Sync > "Sync now" - see `lib/sync/engine.ts`.
- **Backup & restore**: on-demand zip backups (SQLite's own online backup
  API, not a raw file copy), and a restore flow that always takes a safety
  backup of the current database before staging a replacement.
- **Auth**: bcrypt-hashed passwords, HMAC-signed session cookies, a
  first-run wizard that creates the business profile and admin account.
- **Electron shell**: contextIsolation on, nodeIntegration off, a typed
  IPC bridge for native Save/Open dialogs and auto-updates, and a
  restricted CSP.
- **Tests**: 29 Vitest tests covering the calculation engine (including the
  brief's exact worked examples), order ID generation, validation, a full DB
  CRUD flow, and sync engine idempotency/retry/backoff.

## Explicitly out of scope

Per the brief: no inventory, GST/accounting, ERP, HR/payroll, barcode
scanning, WhatsApp integration, manufacturing planning, or multi-branch
support. Add these later if actually needed - the codebase is structured so
they wouldn't require rearchitecting.

## Project layout

```
app/                Next.js App Router pages + API routes (the "backend")
components/          UI, organized by feature (order-table/, customer/, settings/, ...)
lib/                 Business logic: calculations, validation, auth, db repositories, sync, backup, export
db/                  Drizzle schema + generated SQL migrations
electron/            Electron main process, preload bridge, IPC handlers, auto-updater
scripts/             Build helper scripts (standalone-output asset copying)
tests/               Vitest unit/integration tests, tests/e2e/ has a Playwright smoke test
```

## Running it

### As a plain web app (fastest way to try it)

```bash
npm install
npm run dev
```

Open http://localhost:3000 - the first-run wizard walks you through creating
a business profile and admin login. This mode is useful for development; it
stores its SQLite database under `.data/` in the project folder.

### As the actual Windows desktop app

```bash
npm install
npm run build          # builds the Next.js app (output: "standalone")
npm run electron:pack  # packages it into an Electron app for Windows
```

This produces `release/win-unpacked/Jewellery Polishing Manager.exe` - a
fully working, portable Windows application (no installer needed; copy the
whole `win-unpacked` folder to a Windows machine and run the .exe). Its
database lives outside the install directory, in the OS's standard per-user
app-data folder (`%APPDATA%\Jewellery Polishing Manager` on Windows), so it
survives future app updates.

**Note on the single-file installer (`.exe` you double-click to install):**
`npm run electron:pack` builds the NSIS *installer* target by default, which
requires either running on an actual Windows machine, or Wine on
Linux/macOS. This project's config (`package.json` `"build"`) is already set
up for it; if you're on Windows or have a working Wine/CI setup, this just
works. If the installer step fails in your environment for Wine-related
reasons, use `npm run electron:pack:dir` instead (produces the unpacked
`win-unpacked` folder above, or wire up a GitHub Actions `windows-latest`
runner to build the real installer.

### Running the desktop shell against dev mode (faster iteration)

```bash
npm run electron:dev
```

Runs `next dev` and an Electron window pointed at it together, so UI changes
hot-reload inside the actual desktop shell.

### Tests

```bash
npm run test        # Vitest - calculations, validation, DB, sync
npm run typecheck    # tsc --noEmit
npm run lint          # ESLint
node tests/e2e/smoke-test.mjs   # Playwright end-to-end smoke test (needs a running server - see the file's BASE constant)
```

## Configuration

All configuration is environment-variable based - nothing is hardcoded, no
secrets ship in the bundle. Copy `.env.example` to `.env` and fill in what
you need; Next.js loads it automatically, no extra setup required. The app
runs with zero configuration - `.env` is entirely optional and only unlocks
cloud sync.

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | No | Enables cloud sync/backup to MongoDB Atlas. Without it, the app runs entirely offline and Settings > Sync shows "Local only". |
| `USER_DATA_PATH` | No (set automatically by Electron) | Where the SQLite DB, logs, and backups live. Defaults to `./.data` when running standalone (`next dev`/`next start`) outside Electron. |

To enable cloud sync for the **web/server deployment** (`next start`, or an
unpackaged `electron:dev`/`electron:pack:dir` run against `.next/standalone`
directly - a server you control), create a free MongoDB Atlas cluster, get
its connection string, and put it in `.env` as `MONGODB_URI=...` (see
`.env.example`). Next's standalone server reads `.env` files from its own
folder at startup, not from wherever `npm run build` happened to run.

**The packaged desktop installer (`electron:pack`) does NOT inherit `.env`.**
`scripts/copy-standalone-assets.mjs` deliberately strips `.env`/`.env.local`/
`.env.production(.local)` from the staged `build-stage/pkg` folder before
electron-builder ships it, because that folder is unencrypted inside the
installed app - anyone with the installed EXE could otherwise read a live
Atlas connection string off disk. To enable cloud sync in the **shipped
installer**, create a separate `.env.desktop` file (same `MONGODB_URI=`
format) - only that file gets copied in, and only when you explicitly create
it. Use a least-privilege Atlas database user for it (read/write on this
app's collections only), since it will exist on every installed copy. If you
change either file, rebuild (`npm run build`) and repackage
(`npm run electron:pack`) to pick up the change - a client can't edit it
after installing, since it's a packaged app, not a folder of loose config.

**Multi-tenant isolation:** every record synced to Mongo is stamped with a
`tenantId` (Settings > Sync > "Multi-Device Sync ID"), and every push/pull
is filtered by it (`lib/sync/cloud.ts`) - so multiple businesses safely share
one Atlas cluster/database without seeing each other's customers or orders,
even with the same `MONGODB_URI` baked into a build you hand out to several
clients. A device's `tenantId` is normally set once, automatically, the
first time its admin account is created: first-run setup
(`app/api/setup/route.ts`) checks Mongo for an existing business already
registered under that exact username+password (`lib/sync/accounts.ts`) and,
if found, adopts its `tenantId` instead of generating a new random one -
this is what makes "log into the web app, then install the desktop app and
log in with the same credentials" actually share data without any manual
step. A same username with a *different* password is treated as an
unrelated business and gets its own new `tenantId`, which is what prevents
two strangers who happen to pick the same admin username from being merged
into one tenant. The Sync ID field itself remains available for manually
linking/relinking a device (e.g. after a factory-reset install, or to
deliberately point one device at a different business).

## Auto-updates

`electron-updater` is wired up (`electron/updater/index.ts`) but has no
publish target configured yet (`"publish": null` in `package.json`) - "Check
for Updates" in Settings will correctly report "not configured" until you
point it at somewhere to check. To enable it: pick a provider (GitHub
Releases is the simplest free option), set `"publish"` in `package.json`'s
`"build"` section accordingly, and publish releases with
`electron-builder --publish always`.

## Known limitations / next steps

- **Code signing**: the Windows build above is unsigned. Windows SmartScreen
  will warn on first run. Signing requires a code-signing certificate (from
  DigiCert, SSL.com, etc.) - once you have one, add it via electron-builder's
  `win.certificateFile`/`certificatePassword` (or Azure Trusted Signing).
- **App icon**: no custom `.ico` is included yet. Drop one at
  `resources/icon.ico` and see `resources/README.md` for the one-line config
  change to use it.
- **Cloud sync** needs a `MONGODB_URI` to do anything; it's fully optional
  and the app is designed to work indefinitely without it.
