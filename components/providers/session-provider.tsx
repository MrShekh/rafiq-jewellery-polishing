"use client";

import * as React from "react";
import useSWR from "swr";

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "staff";
}

interface SessionContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  refresh: () => void;
}

const SessionContext = React.createContext<SessionContextValue>({
  user: null,
  isLoading: true,
  refresh: () => {},
});

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, mutate } = useSWR<{ user: SessionUser | null }>(
    "/api/auth/session",
    fetcher,
  );

  const value = React.useMemo<SessionContextValue>(
    () => ({ user: data?.user ?? null, isLoading, refresh: () => mutate() }),
    [data, isLoading, mutate],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return React.useContext(SessionContext);
}
