"use client";

import Link from "next/link";
import useSWR from "swr";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Order } from "@/db/schema";
import type { OrderTotals } from "@/lib/calculations";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load dashboard totals.");
  return response.json();
};

interface DashboardResponse {
  today: OrderTotals & { orderCount: number };
  monthly: OrderTotals & { orderCount: number };
  recentOrders: Order[];
  periods: { today: { start: string; end: string }; month: { start: string; end: string } };
}

export function DashboardContent() {
  const { data, error } = useSWR<DashboardResponse>("/api/dashboard", fetcher, { refreshInterval: 30_000 });

  return (
    <div className="h-full min-h-0 overflow-auto p-6">
      {error && <p role="alert" className="mb-4 text-sm text-destructive">Could not refresh dashboard totals. Please try again.</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SummaryCard title="Today's Summary" data={data?.today} dateLabel={data?.periods ? `Orders dated ${data.periods.today.start} (India time)` : undefined} />
        <SummaryCard title="Monthly Summary" data={data?.monthly} dateLabel={data?.periods ? `Orders dated ${data.periods.month.start} to ${data.periods.month.end} (India time)` : undefined} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Fine Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.recentOrders ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    No orders yet.{" "}
                    <Link href="/orders" className="text-primary underline-offset-2 hover:underline">
                      Go to Order Registry
                    </Link>{" "}
                    to add one.
                  </TableCell>
                </TableRow>
              )}
              {data?.recentOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="px-3 py-2 font-mono text-xs">{o.orderNumber}</TableCell>
                  <TableCell className="px-3 py-2">{o.orderDate}</TableCell>
                  <TableCell className="px-3 py-2">{o.customerNameSnapshot}</TableCell>
                  <TableCell className="px-3 py-2">{o.item}</TableCell>
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

function SummaryCard({ title, data, dateLabel }: { title: string; data?: OrderTotals & { orderCount: number }; dateLabel?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {dateLabel && <CardDescription>{dateLabel}</CardDescription>}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Orders" value={data?.orderCount.toLocaleString() ?? "-"} />
        <Stat label="Pieces" value={data?.totalPieces.toLocaleString() ?? "-"} />
        <Stat label="Weight In 1" value={data?.totalWeightIn ?? "-"} />
        <Stat label="Weight Out 1" value={data?.totalWeightOut ?? "-"} />
        <Stat label="Weight In 2" value={data?.totalWeightIn2 ?? "-"} />
        <Stat label="Weight Out 2" value={data?.totalWeightOut2 ?? "-"} />
        <Stat label="Making Charge" value={data?.totalMakingCharge ?? "-"} />
        <Stat label="Loss" value={data?.totalLoss ?? "-"} />

        {/* Fine direction cards — clearly labeled so there's no confusion */}
        <div className="col-span-2 sm:col-span-4">
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <span className="inline-flex items-center gap-1 font-semibold">
                  ↓ You Return to Customer
                </span>
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {data?.totalFineToReturn ?? "-"}
                <span className="ml-1 text-sm font-normal">g</span>
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-600/70 dark:text-emerald-500/70">
                Karigar gives gold back to customer
              </div>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <span className="inline-flex items-center gap-1 font-semibold">
                  ↑ Customer Pays You
                </span>
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                {data?.totalFineToCollect ?? "-"}
                <span className="ml-1 text-sm font-normal">g</span>
              </div>
              <div className="mt-0.5 text-[11px] text-amber-600/70 dark:text-amber-500/70">
                Customer pays karigar (making charge &gt; loss)
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground">Already Settled</div>
              <div className="mt-1 text-xl font-bold tabular-nums">
                {data?.totalCleared ?? "-"}
                <span className="ml-1 text-sm font-normal text-muted-foreground">g</span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Fine already cleared/returned
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-medium tabular-nums">{value}</div>
    </div>
  );
}
