import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";

describe("simple db test", () => {
    it("loads better-sqlite3", () => {
        const db = new Database(":memory:");
        expect(db).toBeDefined();
        db.close();
    });
});
