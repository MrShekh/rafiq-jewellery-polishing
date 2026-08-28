import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: [
            "tests/db.test.ts",
            "tests/sync.test.ts",
        ],
        // globalSetup runs in the main process BEFORE any worker forks,
        // so USER_DATA_PATH is set before paths.ts is evaluated.
        globalSetup: ["tests/global-setup.ts"],
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
