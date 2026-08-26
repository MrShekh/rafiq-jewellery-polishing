"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Phone, MapPin, StickyNote } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Customer, Order } from "@/db/schema";
import type { CustomerSummary } from "@/lib/db/repositories/customers";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SummaryResponse {
  customer: Customer;
  summary: CustomerSummary;
  history: Order[];
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const { data, error } = useSWR<SummaryResponse>(`/api/customers/${customerId}/summary`, fetcher);

  if (error) {
    return <div className="p-6 text-sm text-muted-foreground">Could not load this customer.</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }

  const { customer, summary, history } = data;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-6">
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to customers
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
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

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Total Orders" value={summary.totalOrders.toLocaleString()} />
        <SummaryTile label="Total Pieces" value={summary.totalPieces.toLocaleString()} />
        <SummaryTile label="Total Weight In" value={summary.totalWeightIn} />
        <SummaryTile label="Total Weight Out" value={summary.totalWeightOut} />
        <SummaryTile label="Total Loss" value={summary.totalLoss} />
        <SummaryTile label="Total Fine" value={summary.totalFine} emphasize />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">Weight In</TableHead>
                <TableHead className="text-right">Weight Out</TableHead>
                <TableHead className="text-right">Loss</TableHead>
                <TableHead className="text-right">Touch</TableHead>
                <TableHead className="text-right">Fine Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                    No orders yet for this customer.
                  </TableCell>
                </TableRow>
              )}
              {history.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="px-3 py-2 font-mono text-xs">{o.orderNumber}</TableCell>
                  <TableCell className="px-3 py-2">{o.orderDate}</TableCell>
                  <TableCell className="px-3 py-2">{o.item}</TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">{o.pieces}</TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">{o.weightIn}</TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">{o.weightOut}</TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">{o.loss}</TableCell>
                  <TableCell className="px-3 py-2 text-right tabular-nums">{o.touch}</TableCell>
                  <TableCell className="px-3 py-2 text-right font-medium tabular-nums">{o.fineTotal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${emphasize ? "text-lg font-semibold text-primary" : "text-lg font-medium"}`}>
        {value}
      </div>
    </div>
  );
}
