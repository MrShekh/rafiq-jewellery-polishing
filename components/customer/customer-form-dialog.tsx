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
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import type { Customer } from "@/db/schema";

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  initialName?: string;
  onSaved: (customer: Customer) => void;
}

/** Add/edit customer form (section 18). Used both as a standalone dialog
 * from the Customers page and as the "+ Add new customer" quick-create
 * flow inline in the Order Registry (section 7). */
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  initialName,
  onSaved,
}: CustomerFormDialogProps) {
  const isEdit = !!customer;
  const [name, setName] = React.useState(customer?.name ?? initialName ?? "");
  const [phone, setPhone] = React.useState(customer?.phone ?? "");
  const [address, setAddress] = React.useState(customer?.address ?? "");
  const [notes, setNotes] = React.useState(customer?.notes ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(customer?.name ?? initialName ?? "");
      setPhone(customer?.phone ?? "");
      setAddress(customer?.address ?? "");
      setNotes(customer?.notes ?? "");
    }
  }, [open, customer, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, notes: notes.trim() || null };
      const result = isEdit
        ? await api.patch<{ customer: Customer }>(`/api/customers/${customer!.id}`, payload)
        : await api.post<{ customer: Customer }>("/api/customers", payload);
      toast.success(isEdit ? "Customer updated." : "Customer added.");
      onSaved(result.customer);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save customer.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            Phone and address are optional - just a name is enough to get started.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="customer-name">Name</Label>
            <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input id="customer-phone" value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer-address">Address</Label>
              <Input id="customer-address" value={address ?? ""} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customer-notes">Notes</Label>
            <Textarea id="customer-notes" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : isEdit ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
