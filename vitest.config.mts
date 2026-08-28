import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // calculations, validation, orderId tests don't touch the DB and run
    // fine in any pool. db.test.ts and sync.test.ts require better-sqlite3
    // (a native addon) and must be run separately via `npm run test:db`
    // because Vitest 4's fork worker cannot load native .node binaries
    // reliably on Windows without the Electron ABI rebuild.
    include: [
      "tests/calculations.test.ts",
      "tests/validation.test.ts",
      "tests/orderId.test.ts",
    ],
    pool: "forks",
    maxWorkers: 1,
    isolate: false,
  },
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
});
