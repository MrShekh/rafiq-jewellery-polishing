"use client";

import * as React from "react";
import type { KeyedMutator } from "swr";
import type { Order } from "@/db/schema";
import { api } from "@/lib/api-client";
import { orderUpdateSchema, type OrderInput } from "@/lib/validation/order";
import { OrderSaveQueue, previewOrder, replaceRegistryOrder, type OrdersResponse } from "@/lib/order-editor";
import { toast } from "sonner";

export function useOrderEditor(data: OrdersResponse | undefined, mutate: KeyedMutator<OrdersResponse>) {
  const [pending, setPending] = React.useState<Record<string, Order>>({});
  const current = React.useRef(data);
  current.current = data;
  const overlays = React.useRef<Record<string, Order>>({});
  const versions = React.useRef(new Map<string, number>());
  const queue = React.useRef(new OrderSaveQueue());
  const pendingCount = React.useRef(0);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const save = React.useCallback(async (original: Order, patch: Partial<OrderInput>) => {
    const snapshot = current.current;
    if (!snapshot) return;
    const order = overlays.current[original.id] ?? snapshot.orders.find((row) => row.id === original.id) ?? original;
    const valid = orderUpdateSchema.safeParse({ ...patch, id: order.id });
    if (!valid.success) {
      toast.error(valid.error.issues[0]?.message ?? "Please check this value.");
      throw new Error("Invalid order value");
    }
    const optimistic = previewOrder(order, patch, snapshot.precision, snapshot.formulaVersion);
    const version = (versions.current.get(order.id) ?? 0) + 1;
    versions.current.set(order.id, version);
    overlays.current = { ...overlays.current, [order.id]: optimistic };
    setPending(overlays.current);
    pendingCount.current++;
    clearTimeout(refreshTimer.current);
    try {
      const result = await queue.current.run(order.id, () => api.patch<{ order: Order; warnings: string[] }>(`/api/orders/${order.id}`, patch));
      result.warnings?.forEach((warning) => toast.warning(warning));
      await mutate((value) => value ? replaceRegistryOrder(value, result.order) : value, { revalidate: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that change.");
      throw err;
    } finally {
      if (versions.current.get(order.id) === version) {
        const { [order.id]: removed, ...remaining } = overlays.current;
        overlays.current = remaining;
        setPending(remaining);
      }
      pendingCount.current--;
      if (!pendingCount.current) refreshTimer.current = setTimeout(() => { void mutate(); }, 350);
    }
  }, [mutate]);

  const displayed = React.useMemo(() => {
    if (!data) return data;
    return Object.values(pending).reduce(replaceRegistryOrder, data);
  }, [data, pending]);

  return { displayed, save, saving: Object.keys(pending).length > 0 };
}
