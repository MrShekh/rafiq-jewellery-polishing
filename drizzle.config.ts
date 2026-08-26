import type { Config } from "drizzle-kit";

// Used only by the `drizzle-kit generate` CLI (see package.json "db:generate")
// to diff db/schema.ts against db/migrations and emit a new SQL migration.
// The app itself never talks to this file at runtime - see lib/db/client.ts.
export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
} satisfies Config;
