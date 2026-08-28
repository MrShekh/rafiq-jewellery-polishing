import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Global setup for DB/sync integration tests.
 * MUST run before any module that touches lib/paths.ts is imported,
 * because USER_DATA_DIR is resolved at module-load time.
 */
export async function setup() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jp-global-test-"));
    process.env.USER_DATA_PATH = tmpDir;
    process.env.MONGODB_URI = "mongodb://fake-for-tests";
    // Stored on global so teardown can clean up
    (globalThis as unknown as Record<string, string>).__jp_test_tmpDir = tmpDir;
}

export async function teardown() {
    const tmpDir = (globalThis as unknown as Record<string, string>).__jp_test_tmpDir;
    if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
