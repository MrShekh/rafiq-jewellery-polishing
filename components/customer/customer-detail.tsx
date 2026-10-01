"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowDown, ArrowLeft, ArrowUp, MapPin, Phone, StickyNote } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderFiltersBar, type OrderFiltersState } from "@/components/order-table/order-filters-bar";
import type { Customer, Order } from "@/db/schema";
import type { CustomerSummary } from "@/lib/db/repositories/customers";
import { clearStatusBadgeVariant, clearStatusLabel } from "@/lib/order-status";
import { CustomerSettlement } from "@/components/customer/customer-settlement";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SummaryResponse {
  customer: Customer;
  summary: CustomerSummary;
  history: Order[];
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { data, error } = useSWR<SummaryResponse>(`/api/customers/${customerId}/summary`, fetcher);

  const [filters, setFilters] = React.useState<OrderFiltersState>({
    search: "",
    customerId: "",
    item: "",
    dateRange: {},
    status: "active",
  });

  const history = React.useMemo(() => data?.history ?? [], [data?.history]);
  const filteredHistory = React.useMemo(() => {
    return history.filter((o) => {
      const status = ((o as any).clearStatus as "open" | "partial" | "cleared" | undefined) ?? "open";
      if (filters.status === "active" && status === "cleared") return false;
      if (filters.status === "cleared" && status !== "cleared") return false;
      if (filters.item && o.item !== filters.item) return false;
      if (filters.dateRange.from && o.orderDate < filters.dateRange.from) return false;
      if (filters.dateRange.to && o.orderDate > filters.dateRange.to) return false;
      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        if (!o.item.toLowerCase().includes(q) && !o.orderNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [history, filters]);

  function handlePrint() {
    window.print();
  }

  if (error) {
    return <div className="p-6 text-sm text-muted-foreground">Could not load this customer.</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  const { customer, summary } = data;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-6">
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-print">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {customer.phone && (
              <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {customer.phone}</div>
            )}
            {customer.address && (
              <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {customer.address}</div>
            )}
            {customer.notes && (
              <div className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" /> {customer.notes}</div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 no-print">
        <SummaryTile label="Total Orders" value={summary.totalOrders.toLocaleString()} />
        <SummaryTile label="Total Pieces" value={summary.totalPieces.toLocaleString()} />
        <SummaryTile label="Total Wt In 1" value={summary.totalWeightIn} />
        <SummaryTile label="Total Wt Out 1" value={summary.totalWeightOut} />
        <SummaryTile label="Total Wt In 2" value={summary.totalWeightIn2 || "0.000"} />
        <SummaryTile label="Total Wt Out 2" value={summary.totalWeightOut2 || "0.000"} />
        <SummaryTile label="Total Pieces 2" value={summary.totalPieces2.toLocaleString()} />
        <SummaryTile label="Total Loss" value={summary.totalLoss} />
        {/* Fine direction tiles — always visible so it's clear who owes whom */}
        <SummaryTile
          label="Fine → You Return to Customer"
          value={summary.totalFineToReturn ?? "0.000"}
          variant="return"
          emphasize={Number(summary.totalFineToReturn ?? 0) > 0}
        />
        <SummaryTile
          label="Fine ← Customer Pays You"
          value={summary.totalFineToCollect ?? "0.000"}
          variant="collect"
          emphasize={Number(summary.totalFineToCollect ?? 0) > 0}
        />
        <SummaryTile label="Already Settled" value={summary.totalReturned} />
      </div>

      <CustomerSettlement customerId={customerId} customerName={customer.name} />

      <OrderFiltersBar
        filters={filters}
        onChange={setFilters}
        onPrint={handlePrint}
        showCustomerFilter={false}
        resultCount={filteredHistory.length}
      />

      <Card>
        <CardHeader>
          <CardTitle>Order history - {customer.name}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">Wt In 1</TableHead>
                <TableHead className="text-right">Wt Out 1</TableHead>
                <TableHead className="text-right">Wt In 2</TableHead>
                <TableHead className="text-right">Wt Out 2</TableHead>
                <TableHead className="text-right">Pieces 2</TableHead>
                <TableHead className="text-right">Loss</TableHead>
                <TableHead className="text-right">Touch</TableHead>
                <TableHead className="text-right">Fine Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="h-24 text-center text-sm text-muted-foreground">
                    {history.length === 0 ? "No orders yet for this customer." : "No orders match these filters."}
                  </TableCell>
                </TableRow>
              )}
              {filteredHistory.map((o) => {
                const fine = Number(o.fineTotal);
                const cleared = Number((o as any).clearedAmount ?? 0);
                const outstanding = Math.max(fine - cleared, 0).toFixed(3);
                const status = ((o as any).clearStatus as "open" | "partial" | "cleared" | undefined) ?? "open";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="px-3 py-2 font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell className="px-3 py-2">{o.orderDate}</TableCell>
                    <TableCell className="px-3 py-2">{o.item}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{o.pieces}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{o.weightIn}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{o.weightOut}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">{o.weightIn2 || "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">{o.weightOut2 || "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">{(o as any).pieces2 ?? "—"}</TableCell>
                    <TableCell
                      className={`px-3 py-2 text-right tabular-nums${Number(o.loss) < 0 ? " font-medium text-destructive" : ""}`}
                      title={
                        Number(o.loss) < 0
                          ? `Making Charge exceeds gross loss. Customer pays karigar ${Math.abs(Number(o.loss)).toFixed(3)}g fine.`
                          : undefined
                      }
                    >
                      {o.loss}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">{o.touch}</TableCell>
                    <TableCell
                      className={`px-3 py-2 text-right font-medium tabular-nums`}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>{outstanding}</span>
                        {Number(outstanding) > 0 && (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold leading-none ${
                              Number(o.loss) < 0
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                            }`}
                            title={Number(o.loss) < 0 ? "Customer pays karigar" : "Karigar returns to customer"}
                          >
                            {Number(o.loss) < 0 ? (
                              <><ArrowUp className="h-2.5 w-2.5" />Cust Pays</>
                            ) : (
                              <><ArrowDown className="h-2.5 w-2.5" />Return</>
                            )}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <Badge variant={clearStatusBadgeVariant(status)}>{clearStatusLabel(status)}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  emphasize,
  variant,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  variant?: "return" | "collect";
}) {
  const borderClass =
    variant === "return"
      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
      : variant === "collect"
        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
        : "bg-card";

  const valueClass =
    variant === "return"
      ? "text-emerald-700 dark:text-emerald-400"
      : variant === "collect"
        ? "text-amber-700 dark:text-amber-400"
        : emphasize
          ? "text-primary"
          : "";

  const icon =
    variant === "return" ? (
      <ArrowDown className="inline h-3.5 w-3.5 mr-0.5 text-emerald-600 dark:text-emerald-400" />
    ) : variant === "collect" ? (
      <ArrowUp className="inline h-3.5 w-3.5 mr-0.5 text-amber-600 dark:text-amber-400" />
    ) : null;

  return (
    <div className={`rounded-lg border p-3 ${borderClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums text-lg font-semibold ${valueClass}`}>
        {icon}
        {value}
      </div>
    </div>
  );
}
