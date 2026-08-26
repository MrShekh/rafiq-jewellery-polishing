"use client";

import * as React from "react";
import { toast } from "sonner";
import { DatabaseBackup, Upload, Download, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api-client";
import { isElectron, getElectronAPI } from "@/lib/electron-bridge";

export function DataTab() {
  const [creating, setCreating] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const [confirmRestore, setConfirmRestore] = React.useState<{ open: boolean; pendingFile: File | null }>({
    open: false,
    pendingFile: null,
  });
  const [restartPrompt, setRestartPrompt] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleCreateBackup() {
    setCreating(true);
    try {
      const result = await api.post<{ filePath: string; fileName: string }>("/api/backup/create");
      if (isElectron()) {
        const api2 = getElectronAPI();
        const saveResult = await api2!.saveFileAs(result.filePath, result.fileName);
        if (!saveResult.canceled) {
          toast.success(`Backup saved${saveResult.savedPath ? ` to ${saveResult.savedPath}` : ""}.`);
        }
      } else {
        window.open(`/api/backup/download?file=${encodeURIComponent(result.fileName)}`, "_blank");
        toast.success("Backup created and downloading.");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create backup.");
    } finally {
      setCreating(false);
    }
  }

  async function pickRestoreFile() {
    if (isElectron()) {
      const api2 = getElectronAPI()!;
      const result = await api2.openFileDialog({ filters: [{ name: "Backup files", extensions: ["zip"] }] });
      if (result.canceled || !result.filePath) return;
      runRestoreByPath(result.filePath);
    } else {
      fileInputRef.current?.click();
    }
  }

  async function runRestoreByPath(filePath: string) {
    setRestoring(true);
    try {
      const result = await api.post<{ requiresRestart: boolean }>("/api/backup/restore", { filePath });
      if (result.requiresRestart) setRestartPrompt(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not restore this backup.");
    } finally {
      setRestoring(false);
    }
  }

  async function runRestoreByUpload(file: File) {
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/backup/restore", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new ApiError(body.error ?? "Could not restore this backup.", res.status);
      if (body.requiresRestart) setRestartPrompt(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not restore this backup.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleRestart() {
    const api2 = getElectronAPI();
    if (api2) {
      await api2.relaunchApp();
    } else {
      toast.info("Please close and reopen the application to complete the restore.");
    }
  }

  function handleExport() {
    window.open("/api/orders/export", "_blank");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
          <CardDescription>
            Creates a complete, point-in-time copy of your local data. Keep backups somewhere safe,
            like a USB drive or cloud folder, in addition to cloud sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleCreateBackup} disabled={creating} className="gap-1.5">
            <DatabaseBackup className="h-4 w-4" />
            {creating ? "Creating backup..." : "Create Backup"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restore</CardTitle>
          <CardDescription>
            Replaces your current data with a backup. A safety backup of your current data is always
            taken first, and the application needs to restart to finish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setConfirmRestore({ open: true, pendingFile: file });
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => setConfirmRestore({ open: true, pendingFile: null })}
            disabled={restoring}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {restoring ? "Restoring..." : "Restore from backup"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Export the full Order Registry to Excel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" /> Export all orders to Excel
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmRestore.open}
        onOpenChange={(open) => setConfirmRestore((s) => ({ ...s, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Restore from backup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all current customers, orders, and settings with the contents of the
              backup you choose. A safety copy of your current data is taken automatically first, so
              this can always be undone - but double check you have the right file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRestore({ open: false, pendingFile: null });
                if (confirmRestore.pendingFile) {
                  runRestoreByUpload(confirmRestore.pendingFile);
                } else {
                  pickRestoreFile();
                }
              }}
            >
              Choose backup file
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restartPrompt} onOpenChange={setRestartPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore ready - restart to finish</AlertDialogTitle>
            <AlertDialogDescription>
              Your backup has been staged and a safety copy of the previous data was saved. Restart
              the application now to complete the restore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>I&apos;ll restart later</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestart}>Restart now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
