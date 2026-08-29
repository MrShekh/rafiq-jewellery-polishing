/**
 * Next.js server-startup hook. Runs once per server process, right after
 * the server starts and before it accepts any requests.
 *
 * With the MongoDB-only architecture, this ensures all required indexes
 * are present in MongoDB Atlas on every startup before any request is served.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { ensureIndexes } = await import("@/lib/db/mongo");
    await ensureIndexes();
  } catch (err) {
    // Log but don't crash the server — indexes are for performance,
    // not correctness. The app will work without them (just slower).
    console.error("[startup] Failed to ensure MongoDB indexes:", err);
  }
}
