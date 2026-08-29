import { nanoid } from "nanoid";
import { col, mapDoc } from "@/lib/db/mongo";
import { type UserDoc } from "@/lib/db/types";
import { hashPassword } from "@/lib/auth/password";
import { logger } from "@/lib/logger";

export async function findUserByUsername(username: string): Promise<any | null> {
  const c = await col<UserDoc>("users");
  const doc = await c.findOne({ username: username.toLowerCase().trim() });
  return doc ? mapDoc(doc) : null;
}

export async function findUserById(id: string): Promise<any | null> {
  const c = await col<UserDoc>("users");
  const doc = await c.findOne({ _id: id });
  return doc ? mapDoc(doc) : null;
}

export async function hasAnyUser(): Promise<boolean> {
  const c = await col<UserDoc>("users");
  const count = await c.countDocuments();
  return count > 0;
}

export async function createAdminUser(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<UserDoc> {
  const id = nanoid();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);

  const doc: UserDoc = {
    _id: id,
    username: input.username.toLowerCase().trim(),
    displayName: input.displayName,
    passwordHash,
    role: "admin",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const c = await col<UserDoc>("users");
  await c.insertOne(doc as any);
  logger.info("Admin user created", { userId: id, username: doc.username });
  return doc;
}

export async function touchLastLogin(userId: string) {
  const c = await col<UserDoc>("users");
  await c.updateOne({ _id: userId }, { $set: { lastLoginAt: new Date().toISOString() } });
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  const c = await col<UserDoc>("users");
  await c.updateOne({ _id: userId }, { $set: { passwordHash, updatedAt: new Date().toISOString() } });
  logger.info("Password changed", { userId });
}

export async function updateUserProfile(userId: string, updates: { displayName?: string }) {
  const c = await col<UserDoc>("users");
  await c.updateOne({ _id: userId }, { $set: { ...updates, updatedAt: new Date().toISOString() } });
  return findUserById(userId);
}
