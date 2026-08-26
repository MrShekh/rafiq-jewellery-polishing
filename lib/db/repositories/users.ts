import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { users } from "@/db/schema";
import { db } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/db/repositories/audit";
import { logger } from "@/lib/logger";

export function findUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username.toLowerCase().trim())).get();
}

export function hasAnyUser(): boolean {
  const row = db.select({ id: users.id }).from(users).limit(1).get();
  return !!row;
}

export async function createAdminUser(input: {
  username: string;
  displayName: string;
  password: string;
}) {
  const id = nanoid();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);

  const values = {
    id,
    username: input.username.toLowerCase().trim(),
    displayName: input.displayName,
    passwordHash,
    role: "admin" as const,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  db.transaction((tx) => {
    tx.insert(users).values(values).run();
    recordAudit(tx, {
      entityType: "user",
      entityId: id,
      action: "create",
      userId: id,
      message: "Admin account created during first-run setup",
    });
  });

  logger.info("Admin user created", { userId: id, username: values.username });
  return values;
}

export function touchLastLogin(userId: string) {
  db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  db.transaction((tx) => {
    tx.update(users)
      .set({ passwordHash, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId))
      .run();
    recordAudit(tx, { entityType: "user", entityId: userId, action: "change_password", userId });
  });
  logger.info("Password changed", { userId });
}

export function updateUserProfile(userId: string, updates: { displayName?: string }) {
  db.update(users)
    .set({ ...updates, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId))
    .run();
  return db.select().from(users).where(eq(users.id, userId)).get();
}
