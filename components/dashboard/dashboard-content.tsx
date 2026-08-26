"use client";

import Link from "next/link";
import useSWR from "swr";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DashboardResponse {
  today: OrderTotals & { orderCount: number };
  monthly: OrderTotals & { orderCount: number };
  recentOrders: Order[];
}

export function DashboardContent() {
  const { data } = useSWR<DashboardResponse>("/api/dashboard", fetcher, { refreshInterval: 30_000 });

  return (
    <div className="h-full min-h-0 overflow-auto p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SummaryCard title="Today's Summary" data={data?.today} />
        <SummaryCard title="Monthly Summary" data={data?.monthly} />
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

function SummaryCard({ title, data }: { title: string; data?: OrderTotals & { orderCount: number } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Orders" value={data?.orderCount.toLocaleString() ?? "-"} />
        <Stat label="Pieces" value={data?.totalPieces.toLocaleString() ?? "-"} />
        <Stat label="Weight In" value={data?.totalWeightIn ?? "-"} />
        <Stat label="Weight Out" value={data?.totalWeightOut ?? "-"} />
        <Stat label="Making Charge" value={data?.totalMakingCharge ?? "-"} />
        <Stat label="Loss" value={data?.totalLoss ?? "-"} />
        <Stat label="Fine Total" value={data?.totalFineTotal ?? "-"} emphasize />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 tabular-nums ${emphasize ? "text-lg font-semibold text-primary" : "text-base font-medium"}`}>
        {value}
      </div>
    </div>
  );
}
