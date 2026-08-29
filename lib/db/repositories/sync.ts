export const SYNC_META_KEYS = {
  lastSyncStartedAt: "sync.last_started_at",
  lastSyncCompletedAt: "sync.last_completed_at",
  lastSyncError: "sync.last_error",
} as const;

export function getPendingSyncCount(): number {
  return 0;
}

export function getFailedSyncCount(): number {
  return 0;
}

export function getSyncMeta(key: string): string | null {
  return null;
}

export function setSyncMeta(key: string, value: string) { }

export function getSyncStatusSnapshot() {
  return {
    pendingCount: 0,
    failedCount: 0,
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncError: null,
    tenantId: "",
  };
}
