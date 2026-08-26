import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "@/db/schema";
import { logger } from "@/lib/logger";
import { DB_FILE_PATH, ensureAppDirectories } from "@/lib/paths";

/**
 * Singleton SQLite connection + Drizzle instance for the whole Next.js
 * server process. `globalThis` caching is the standard trick to survive
 * Next.js dev-mode hot-reload (which would otherwise re-import this module
 * and open a second connection to the same file on every save).
 *
 * Migrations run once, synchronously, the first time this module is
 * imported - before any request handler can touch the database - which is
 * what satisfies requirement #33 ("database changes must be handled through
 * migrations... never destroy existing data during application updates").
 */

declare global {
  // eslint-disable-next-line no-var
  var __jewelleryDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var __jewellerySqlite: Database.Database | undefined;
}

function createConnection() {
  ensureAppDirectories();

  const sqlite = new Database(DB_FILE_PATH);
  // WAL mode: readers don't block the writer, which matters once the sync
  // engine is reading/writing in the background while the UI is also
  // hitting the DB for every keystroke's autosave.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = path.join(process.cwd(), "db", "migrations");
  try {
    migrate(db, { migrationsFolder });
    logger.info("Database migrations applied", { dbFile: DB_FILE_PATH });
  } catch (err) {
    logger.error("Database migration failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return { db, sqlite };
}

function getConnection() {
  if (!globalThis.__jewelleryDb || !globalThis.__jewellerySqlite) {
    const { db, sqlite } = createConnection();
    globalThis.__jewelleryDb = db;
    globalThis.__jewellerySqlite = sqlite;
  }
  return { db: globalThis.__jewelleryDb!, sqlite: globalThis.__jewellerySqlite! };
}

/**
 * Lazily-resolved exports — the connection is only opened the first time
 * `db` or `sqlite` is actually accessed inside a request handler, NOT when
 * this module is imported.  Without this guard the Next.js build worker
 * (which evaluates the module graph during "Collecting page data") would
 * call `new Database(...)` before a DB path exists, crashing the worker
 * with exit code 3221225477 (Windows access violation on the .node binary).
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    const target = getConnection().db;
    const value = Reflect.get(target, prop);
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
});

export const sqlite = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const target = getConnection().sqlite;
    const value = Reflect.get(target, prop);
    if (typeof value === "function") {
      return value.bind(target);
    }
    return value;
  },
});

/**
 * The type of `tx` inside `db.transaction((tx) => { ... })`. Drizzle's
 * better-sqlite3 driver gives that callback a `SQLiteTransaction<...>`,
 * which is a *different* TS type than `typeof db` itself (it lacks
 * `$client`/nested `.transaction()`) even though both expose the same
 * `.select()/.insert()/.update()/.delete()` query builder surface that
 * repository helpers (recordAudit, queueSync) actually use. Every call to
 * those helpers passes the in-transaction `tx`, never the top-level `db`,
 * so this is the type they should accept.
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
