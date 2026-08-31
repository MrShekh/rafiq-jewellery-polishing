/**
 * Quick password reset script.
 * Usage: node scripts/reset-password.mjs <username> <newpassword>
 * Example: node scripts/reset-password.mjs admin NewPass123
 */

import { MongoClient } from "mongodb";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
try {
    const envFile = readFileSync(join(__dirname, "../.env"), "utf8");
    for (const line of envFile.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
    }
} catch {
    // .env not found, rely on process.env
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
}

const username = process.argv[2];
const newPassword = process.argv[3];

if (!username || !newPassword) {
    console.error("Usage: node scripts/reset-password.mjs <username> <newpassword>");
    process.exit(1);
}

// Use bcryptjs to hash the password
const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const client = new MongoClient(MONGODB_URI);

try {
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas");

    const db = client.db();
    const users = db.collection("users");

    // Find the user
    const user = await users.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
        // List all users to help
        const allUsers = await users.find({}, { projection: { username: 1, displayName: 1 } }).toArray();
        console.error(`❌ User "${username}" not found.`);
        console.log("📋 Available users:");
        allUsers.forEach(u => console.log(`   - ${u.username} (${u.displayName})`));
        process.exit(1);
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update the password
    await users.updateOne(
        { _id: user._id },
        { $set: { passwordHash, updatedAt: new Date().toISOString() } }
    );

    console.log(`✅ Password for "${username}" has been reset successfully!`);
    console.log(`   New password: ${newPassword}`);
} catch (err) {
    console.error("❌ Error:", err.message);
} finally {
    await client.close();
}
