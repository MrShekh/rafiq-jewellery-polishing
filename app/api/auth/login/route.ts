import { NextRequest } from "next/server";
import { z } from "zod";

import { handleApiError, ok } from "@/lib/api/respond";
import { findUserByUsername, touchLastLogin } from "@/lib/db/repositories/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { username, password } = loginSchema.parse(await req.json());

    const user = await findUserByUsername(username);
    if (!user || !user.isActive) {
      logger.warn("Login failed: unknown or inactive user", { username });
      return ok({ error: "Incorrect username or password." }, 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      logger.warn("Login failed: bad password", { username });
      return ok({ error: "Incorrect username or password." }, 401);
    }

    await createSession(user._id);
    await touchLastLogin(user._id);
    logger.info("Login succeeded", { userId: user._id, username });

    return ok({
      user: { id: user._id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
