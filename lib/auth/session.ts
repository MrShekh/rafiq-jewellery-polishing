import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/mongo";
import { logger } from "@/lib/logger";

/**
 * Cookie-based session auth backed by MongoDB.
 *
 * The HMAC signing secret is generated once and stored in MongoDB.
 * Sessions are signed and verified entirely in-process; no external
 * session store is required.
 */

const SESSION_COOKIE = "jp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const SECRET_KEY = "auth.session_secret";
const SECRET_COLLECTION = "app_config";

// Cache secret in memory for the lifetime of the process
let _cachedSecret: string | null = null;

async function getOrCreateSecret(): Promise<string> {
  if (_cachedSecret) return _cachedSecret;

  const db = await getDb();
  const c = db.collection<{ _id: string; value: string }>(SECRET_COLLECTION);
  const existing = await c.findOne({ _id: SECRET_KEY });
  if (existing) {
    _cachedSecret = existing.value;
    return _cachedSecret;
  }

  const secret = crypto.randomBytes(48).toString("hex");
  await c.insertOne({ _id: SECRET_KEY, value: secret });
  _cachedSecret = secret;
  return secret;
}

interface SessionPayload {
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

async function sign(payload: SessionPayload): Promise<string> {
  const secret = await getOrCreateSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

async function verify(token: string): Promise<SessionPayload | null> {
  const secret = await getOrCreateSecret();
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expectedMac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const macBuf = Buffer.from(mac);
  const expectedBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const now = Date.now();
  const token = await sign({ userId, issuedAt: now, expiresAt: now + SESSION_TTL_MS });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "staff";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verify(token);
  if (!payload) return null;

  const { findUserById } = await import("@/lib/db/repositories/users");
  const user = await findUserById(payload.userId);
  if (!user || !user.isActive) return null;

  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    logger.warn("Rejected request: no valid session");
    throw new AuthError("Not authenticated");
  }
  return user;
}

export class AuthError extends Error { }
