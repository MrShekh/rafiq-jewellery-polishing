/**
 * Next.js server-startup hook (stable since Next 14, no experimental flag
 * needed - see next.config.mjs). `register()` runs exactly once per server
 * process, right after the server starts and before it accepts requests -
 * for this app that is: once for the hosted "web" deployment (`next start`
 * / `next dev`), and once for the local standalone server.js that
 * electron/main.ts spawns as the desktop app's backend.
 *
 * This is the fix for section 26 of the brief ("sync automatically... at
 * minimum: on application startup"): lib/sync/engine.ts's
 * startPeriodicSync() was fully implemented but never actually called from
 * anywhere, so background sync only ever ran when a user manually pressed
 * "Sync now" in Settings. Wiring it here means every server process that
 * boots with MONGODB_URI configured starts syncing on its own, with zero
 * per-page/per-route changes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startPeriodicSync } = await import("@/lib/sync/engine");
  startPeriodicSync();
}
