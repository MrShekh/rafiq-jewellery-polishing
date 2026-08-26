"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useItemOptions() {
  const { data } = useSWR<{ items: string[] }>("/api/orders/items", fetcher);
  return data?.items ?? ["Ring", "Chain", "Bracelet", "Necklace", "Earrings", "Other"];
}
