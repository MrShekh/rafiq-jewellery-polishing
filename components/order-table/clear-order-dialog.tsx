"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import type { Order } from "@/db/schema";

interface ClearOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
  onCleared: () => void;
}

/** Full or partial fine settlement for one order (section 3: order clearing). */
export function ClearOrderDialog({ open, onOpenChange, order, onCleared }: ClearOrderDialogProps) {
  const [amount, setAmount] = React.useState("0.000");
  const [submitting, setSubmitting] = React.useState(false);

  const fineTotal = order ? Number(order.fineTotal) : 0;
  const clearedSoFar = order ? Number((order as any).clearedAmount ?? 0) : 0;
  const remaining = Math.max(fineTotal - clearedSoFar, 0);

  React.useEffect(() => {
    if (open) setAmount(remaining > 0 ? remaining.toFixed(3) : "0.000");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id]);

  async function submit(payloadAmount: "full" | string) {
    if (!order) return;
    setSubmitting(true);
    try {
      await api.post(`/api/orders/${order.id}/clear`, { amount: payloadAmount });
      toast.success(payloadAmount === "full" ? "Order fully cleared." : "Amount cleared.");
      onCleared();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not clear this order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear fine{order ? ` - ${order.orderNumber}` : ""}</DialogTitle>
          <DialogDescription>
            {order ? `${order.customerNameSnapshot} - ${order.item}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Fine Total</div>
            <div className="font-medium tabular-nums">{fineTotal.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Cleared so far</div>
            <div className="font-medium tabular-nums">{clearedSoFar.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Remaining due</div>
            <div className="font-semibold tabular-nums text-primary">{remaining.toFixed(3)}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="clear-amount">Amount to clear</Label>
          <Input
            id="clear-amount"
            type="number"
            step="0.001"
            min="0"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={remaining <= 0}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={submitting || remaining <= 0 || !amount || Number(amount) <= 0}
            onClick={() => submit(amount)}
          >
            Clear this amount
          </Button>
          <Button type="button" disabled={submitting || remaining <= 0} onClick={() => submit("full")}>
            Clear full amount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
