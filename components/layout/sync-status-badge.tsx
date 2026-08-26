"use client";

import { CloudOff, CloudCheck, CloudAlert, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";

/**
 * Sync status indicator (section 20/24):
 *   Cloud Sync: Connected / Offline
 *   Last Sync: ...
 *   Pending Records: N
 * Shown compactly in the Topbar and expanded on the Settings page.
 */
export function SyncStatusBadge({ compact = false }: { compact?: boolean }) {
  const { status, isLoading } = useSyncStatus();

  if (isLoading || !status) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <RefreshCw className="h-3 w-3 animate-spin" />
        {!compact && "Checking sync..."}
      </Badge>
    );
  }

  if (!status.cloudSyncConfigured) {
    return (
      <Badge variant="outline" className="gap-1.5 text-muted-foreground">
        <CloudOff className="h-3 w-3" />
        {compact ? "Local only" : "Cloud sync not set up"}
      </Badge>
    );
  }

  if (status.failedCount > 0) {
    return (
      <Badge variant="warning" className="gap-1.5">
        <CloudAlert className="h-3 w-3" />
        {compact ? `${status.failedCount} failed` : `${status.failedCount} record(s) failed to sync`}
      </Badge>
    );
  }

  if (status.pendingCount > 0) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <RefreshCw className="h-3 w-3" />
        {compact ? `${status.pendingCount} pending` : `Syncing ${status.pendingCount} record(s)...`}
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="gap-1.5">
      <CloudCheck className="h-3 w-3" />
      {compact ? "Synced" : "Cloud sync up to date"}
    </Badge>
  );
}
