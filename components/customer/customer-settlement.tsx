"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { CustomerSettlementPreview, CustomerSettlementResponse } from "@/lib/customer-settlement";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function balanceLabel(direction: CustomerSettlementPreview["direction"]) {
  return direction === "collect" ? "Customer pays you" : direction === "return" ? "You return to customer" : "No payment needed";
}

export function CustomerSettlement({ customerId, customerName }: { customerId: string; customerName: string }) {
  const url = `/api/customers/${customerId}/settlement`;
  const { data, error, mutate } = useSWR<CustomerSettlementResponse>(url, api.get);
  const { mutate: refreshCaches } = useSWRConfig();
  const [review, setReview] = React.useState<CustomerSettlementPreview | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function openReview() {
    setBusy(true);
    try {
      const current = await api.get<CustomerSettlementResponse>(url);
      await mutate(current, false);
      setReview(current.preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the balance.");
    } finally { setBusy(false); }
  }

  async function clear() {
    if (!review || busy) return;
    setBusy(true);
    try {
      const result = await api.post<{ orderCount: number }>(url, { token: review.token });
      setReview(null);
      toast.success(`${result.orderCount} orders settled for ${customerName}.`);
      await refreshCaches((key) => typeof key === "string" && /^\/api\/(customers|orders|dashboard)([/?]|$)/.test(key));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear this balance.");
      setReview(null);
      await mutate();
    } finally { setBusy(false); }
  }

  return (
    <Card id="customer-balance" className="mb-6">
      <CardHeader><CardTitle>Customer balance</CardTitle></CardHeader>
      <CardContent>
        {error ? <p role="alert">Could not load the balance. <Button variant="link" onClick={() => mutate()}>Retry</Button></p> : !data ? <p>Loading balance...</p> : <>
          <p className="text-lg font-semibold">{balanceLabel(data.preview.direction)}: {data.preview.amount} g</p>
          <p className="mt-1 text-sm text-muted-foreground">{data.preview.orderCount} outstanding orders across all dates. Order history filters do not change this balance.</p>
          <Button className="mt-3 no-print" disabled={busy || data.preview.orderCount === 0} onClick={openReview}>
            {busy ? "Please wait..." : "Clear Customer Balance"}
          </Button>
          {data.settlements.length > 0 && <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">Recent settlements</summary>
            <ul className="mt-2 space-y-2">
              {data.settlements.map((record) => <li key={record.id} className="rounded border p-2">
                <span className="font-medium">{new Date(record.createdAt).toLocaleString()}</span>
                <div>{balanceLabel(record.direction)}: {record.amount} g · {record.orderCount} orders settled</div>
                <div className="text-muted-foreground">Customer owed {record.toCollect} g · You owed {record.toReturn} g</div>
              </li>)}
            </ul>
          </details>}
        </>}
      </CardContent>
      <Dialog open={!!review} onOpenChange={(open) => { if (!open && !busy) setReview(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear balance — {customerName}</DialogTitle>
            <DialogDescription>Review all {review?.orderCount} outstanding orders. Previously cleared amounts are already excluded.</DialogDescription>
          </DialogHeader>
          {review && <dl className="space-y-3 rounded border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between"><dt>Customer pays you</dt><dd>{review.toCollect} g</dd></div>
            <div className="flex justify-between"><dt>You return to customer</dt><dd>{review.toReturn} g</dd></div>
            <div className="flex justify-between border-t pt-3 font-semibold"><dt>{balanceLabel(review.direction)}</dt><dd>{review.amount} g</dd></div>
          </dl>}
          <p className="text-sm text-muted-foreground">Confirm after the net payment has been settled. All included orders will be marked cleared and kept in order history.</p>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReview(null)}>Cancel</Button>
            <Button disabled={busy || !review?.orderCount} onClick={clear}>{busy ? "Clearing..." : "Confirm settlement"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
