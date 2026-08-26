import crypto from "node:crypto";

import { cookies } from "next/headers";

import { db } from "@/lib/db/client";
import { settings, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Session handling for a single-machine desktop app.
 *
 * There is no external auth provider and no network involved: the Next.js
 * server this code runs in is bound to 127.0.0.1 only (see electron/main.ts)
 * and is never reachable from outside the user's own machine. We still
 * treat it like a real auth boundary though (bcrypt-hashed passwords,
 * signed + expiring session tokens in an httpOnly cookie) because "runs
 * locally" is not the same thing as "cannot be attacked" - the packaged
 * app should behave safely even if the user's machine is shared or
 * compromised.
 *
 * The signing secret is generated once (crypto.randomBytes) on first run
 * and stored in the `settings` table; it never leaves this process and is
 * never hard-coded (section 31: never hard-code secrets).
 */

const SESSION_COOKIE = "jp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days ("remember session")
const SECRET_SETTING_KEY = "auth.session_secret";

function getOrCreateSecret(): string {
  const row = db.select().from(settings).where(eq(settings.key, SECRET_SETTING_KEY)).get();
  if (row) return row.value;

  const secret = crypto.randomBytes(48).toString("hex");
  db.insert(settings)
    .values({ key: SECRET_SETTING_KEY, value: secret })
    .onConflictDoNothing()
    .run();
  return secret;
}

interface SessionPayload {
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

function sign(payload: SessionPayload): string {
  const secret = getOrCreateSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): SessionPayload | null {
  const secret = getOrCreateSecret();
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
  const token = sign({ userId, issuedAt: now, expiresAt: now + SESSION_TTL_MS });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // local-only HTTP server (127.0.0.1); see electron/main.ts
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

  const payload = verify(token);
  if (!payload) return null;

  const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
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

export class AuthError extends Error {}
