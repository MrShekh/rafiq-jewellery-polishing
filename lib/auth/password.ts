import bcrypt from "bcryptjs";

/**
 * Password hashing (brief section 29: "Password must never be stored as
 * plain text. Use secure password hashing.").
 *
 * We use bcryptjs (pure JS, 12 rounds) rather than a native module like
 * argon2/bcrypt: this app already ships one native dependency
 * (better-sqlite3) that has to survive `electron-rebuild` for every
 * Electron version bump; a pure-JS hashing library removes a second native
 * build from that critical path. For a single-business desktop app's login
 * (a handful of attempts a day, not a public API), bcrypt at cost 12 is
 * comfortably strong and the throughput difference vs argon2 is irrelevant.
 */

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return "Password must contain both letters and numbers.";
  }
  return null;
}
