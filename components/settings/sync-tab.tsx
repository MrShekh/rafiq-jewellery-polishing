"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw, Copy, Check, Edit2, Save } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [newTenantId, setNewTenantId] = React.useState("");

  React.useEffect(() => {
    if (status?.tenantId) {
      setNewTenantId(status.tenantId);
    }
  }, [status?.tenantId]);

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

  function handleCopy() {
    if (status?.tenantId) {
      navigator.clipboard.writeText(status.tenantId);
      setCopied(true);
      toast.success("Sync ID copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleSaveTenantId() {
    if (!newTenantId.trim()) {
      toast.error("Sync ID cannot be empty.");
      return;
    }
    try {
      await api.post("/api/sync/status", { tenantId: newTenantId.trim() });
      toast.success("Sync ID updated successfully!");
      setEditing(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update Sync ID.");
    }
  }

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Multi-Device Sync ID</CardTitle>
          <CardDescription>
            Use this unique ID to link multiple devices (like your web platform and desktop app) to the same business account. Devices with the same Sync ID will share and synchronize data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              {editing ? (
                <Input
                  value={newTenantId}
                  onChange={(e) => setNewTenantId(e.target.value)}
                  placeholder="Enter Sync ID (e.g. tenant_...)"
                  className="max-w-md"
                />
              ) : (
                <div className="font-mono text-sm bg-muted p-2.5 rounded-md break-all select-all">
                  {status?.tenantId || "Loading..."}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {editing ? (
                <>
                  <Button onClick={handleSaveTenantId} size="sm" className="gap-1">
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  <Button onClick={() => { setEditing(false); if (status?.tenantId) setNewTenantId(status.tenantId); }} variant="outline" size="sm">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleCopy} variant="outline" size="sm" className="gap-1">
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    Copy
                  </Button>
                  <Button onClick={() => setEditing(true)} variant="outline" size="sm" className="gap-1">
                    <Edit2 className="h-4 w-4" />
                    Change Sync ID
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
