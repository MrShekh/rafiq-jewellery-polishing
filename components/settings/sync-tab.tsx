"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SyncStatusBadge } from "@/components/layout/sync-status-badge";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { api, ApiError } from "@/lib/api-client";

function formatWhen(iso: string | null) {
  if (!iso) return "Never";
  try {
    return `${formatDistanceToNow(new Date(iso))} ago`;
  } catch {
    return iso;
  }
}

export function SyncTab() {
  const { status, refresh } = useSyncStatus();
  const [syncing, setSyncing] = React.useState(false);

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const result = await api.post<{ attempted: boolean; reason?: string; succeeded: number; failed: number }>(
        "/api/sync/run",
      );
      if (!result.attempted) {
        toast.info(result.reason ?? "Cloud sync is not set up.");
      } else if (result.failed > 0) {
        toast.warning(`Synced ${result.succeeded}, ${result.failed} failed.`);
      } else {
        toast.success(result.succeeded > 0 ? `Synced ${result.succeeded} record(s).` : "Already up to date.");
      }
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud sync</CardTitle>
        <CardDescription>
          Orders and customers are always saved locally first and work fully offline. When the
          internet is available, they sync to your cloud backup automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.cloudSyncConfigured && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Cloud sync isn&apos;t set up on this computer yet. Your data is completely safe and fully
            usable offline - this just means it isn&apos;t also being copied to the cloud. Ask your
            software provider to configure cloud sync when you&apos;re ready for it.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Cloud Sync</div>
            <div className="mt-1"><SyncStatusBadge /></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last Sync</div>
            <div className="mt-1 text-sm">{formatWhen(status?.lastSyncCompletedAt ?? null)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Pending Records</div>
            <div className="mt-1 text-sm tabular-nums">{status?.pendingCount ?? 0}</div>
          </div>
        </div>

        {status && status.failedCount > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            {status.failedCount} record(s) repeatedly failed to sync. {status.lastSyncError}
          </div>
        )}

        <Button onClick={handleSyncNow} disabled={syncing} className="gap-1.5">
          <RefreshCw className={syncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {syncing ? "Syncing..." : "Sync now"}
        </Button>
      </CardContent>
    </Card>
  );
}
