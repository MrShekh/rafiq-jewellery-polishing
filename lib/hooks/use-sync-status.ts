"use client";

import useSWR from "swr";

export interface SyncStatus {
  pendingCount: number;
  failedCount: number;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
  cloudSyncConfigured: boolean;
  tenantId?: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Polls sync status every 20s - cheap local SQLite reads, no network
 * traffic of its own (section 20: Settings must show live sync status). */
export function useSyncStatus() {
  const { data, mutate, isLoading } = useSWR<SyncStatus>("/api/sync/status", fetcher, {
    refreshInterval: 20_000,
  });
  return { status: data, isLoading, refresh: mutate };
}
