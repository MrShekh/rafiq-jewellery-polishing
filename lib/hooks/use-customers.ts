"use client";

import useSWR from "swr";

import type { Customer } from "@/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCustomers(options: { includeInactive?: boolean } = {}) {
  const qs = options.includeInactive ? "?includeInactive=true" : "";
  const { data, isLoading, mutate } = useSWR<{ customers: Customer[] }>(
    `/api/customers${qs}`,
    fetcher,
  );
  return { customers: data?.customers ?? [], isLoading, refresh: mutate };
}
