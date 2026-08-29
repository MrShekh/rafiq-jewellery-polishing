export async function runSyncCycle() {
  return { attempted: false, reason: "Cloud sync is not configured", processed: 0, succeeded: 0, failed: 0 };
}

export function startPeriodicSync() { }
export function stopPeriodicSync() { }
