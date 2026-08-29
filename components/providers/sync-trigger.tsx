"use client";

import * as React from "react";

import { api } from "@/lib/api-client";

/**
 * Automatic sync triggers that only make sense while inside the
 * authenticated app shell (section 15/26 of the brief: sync on app open and
 * when the network reconnects). The 60s periodic sync itself lives
 * server-side in instrumentation.ts (runs once per server process, not per
 * browser tab); this component covers the two things only the browser can
 * see: "the app just opened" and "the network just came back".
 *
 * Never blocks the UI - every call here is fire-and-forget. Errors are
 * expected when offline and are surfaced through the existing sync status
 * badge (components/layout/sync-status-badge.tsx), not here.
 */
export function SyncTrigger() {
  React.useEffect(() => {
    api.post("/api/sync/run").catch(() => {});

    function handleOnline() {
      api.post("/api/sync/run").catch(() => {});
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return null;
}
