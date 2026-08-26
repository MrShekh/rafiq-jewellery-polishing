"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { DownloadCloud } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isElectron, getElectronAPI } from "@/lib/electron-bridge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ApplicationTab() {
  const { data } = useSWR<{ appVersion: string }>("/api/settings", fetcher);
  const [checking, setChecking] = React.useState(false);
  const [updateState, setUpdateState] = React.useState<string | null>(null);

  async function handleCheckForUpdates() {
    if (!isElectron()) {
      toast.info("Update checks are only available in the installed desktop application.");
      return;
    }
    setChecking(true);
    setUpdateState(null);
    try {
      const result = await getElectronAPI()!.checkForUpdates();
      if (result.status === "available") {
        setUpdateState(`Update available: version ${result.version}. Downloading in the background...`);
      } else if (result.status === "not-available") {
        setUpdateState("You're on the latest version.");
      } else if (result.status === "unsupported") {
        setUpdateState("Automatic updates aren't configured for this build.");
      } else {
        setUpdateState(result.message ?? "Could not check for updates.");
      }
    } catch {
      setUpdateState("Could not check for updates.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application</CardTitle>
        <CardDescription>Jewellery Polishing Manager</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Version:</span>
          <Badge variant="secondary">{data?.appVersion ?? "..."}</Badge>
        </div>

        <Button variant="outline" onClick={handleCheckForUpdates} disabled={checking} className="gap-1.5">
          <DownloadCloud className="h-4 w-4" />
          {checking ? "Checking..." : "Check for Updates"}
        </Button>

        {updateState && <p className="text-sm text-muted-foreground">{updateState}</p>}
      </CardContent>
    </Card>
  );
}
