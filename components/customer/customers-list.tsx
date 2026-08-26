"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, Plus, Phone, MapPin, UserX, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CustomerFormDialog } from "@/components/customer/customer-form-dialog";
import { api, ApiError } from "@/lib/api-client";
import type { Customer } from "@/db/schema";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CustomersList() {
  const [search, setSearch] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<Customer | null>(null);

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (showInactive) qs.set("includeInactive", "true");

  const { data, mutate } = useSWR<{ customers: Customer[] }>(`/api/customers?${qs.toString()}`, fetcher);
  const customers = data?.customers ?? [];

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      await api.delete(`/api/customers/${deactivateTarget.id}`);
      toast.success("Customer removed.");
      mutate();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Has existing orders - fall back to deactivating instead of deleting.
        await api.patch(`/api/customers/${deactivateTarget.id}`, { isActive: false });
        toast.success("Customer deactivated (existing orders were kept).");
        mutate();
      } else {
        toast.error(err instanceof ApiError ? err.message : "Could not remove this customer.");
      }
    } finally {
      setDeactivateTarget(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers..."
            className="h-9 pl-8"
          />
        </div>
        <Button
          variant={showInactive ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowInactive((s) => !s)}
        >
          {showInactive ? "Showing all" : "Show inactive"}
        </Button>
        <div className="ml-auto">
          <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-3.5 w-3.5" /> Add customer
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {customers.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No customers yet. Add your first one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => (
              <div key={c.id} className="group relative rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
                <Link href={`/customers/${c.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold">{c.name}</h3>
                    {!c.isActive && <Badge variant="outline" className="shrink-0 text-muted-foreground">Inactive</Badge>}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {c.phone && (
                      <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {c.phone}</div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> <span className="truncate">{c.address}</span></div>
                    )}
                  </div>
                </Link>
                <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => { setEditing(c); setFormOpen(true); }}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  {c.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setDeactivateTarget(c)}
                    >
                      <UserX className="h-3 w-3" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        onSaved={() => mutate()}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              If this customer has no orders, they&apos;ll be deleted. If they have order
              history, they&apos;ll be deactivated instead so past orders stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeactivate}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
