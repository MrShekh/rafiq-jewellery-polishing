"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Cloud } from "lucide-react";

export function SyncTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud Database</CardTitle>
        <CardDescription>
          Your data is stored directly in MongoDB Atlas — the same database is used by both the web
          platform and the desktop app. There is no local sync needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
          <div>
            <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Always in Sync
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Every customer and order you create is saved directly to MongoDB Atlas in real time.
              Open the app on any device with the same account and you will see the same data
              instantly — no sync button needed.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
