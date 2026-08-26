"use client";

import * as React from "react";
import useSWR from "swr";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";
import type { Order } from "@/db/schema";
import type { OrderTotals } from "@/lib/calculations";
import {
  GridTextInput,
  ReadOnlyCell,
  useCellNavigation,
  type CellRefMap,
} from "@/components/order-table/editable-cells";
import { OrderFiltersBar, type OrderFiltersState } from "@/components/order-table/order-filters-bar";
import { DeleteOrderDialog } from "@/components/order-table/delete-order-dialog";
import { CustomerFormDialog } from "@/components/customer/customer-form-dialog";
import { useCustomers } from "@/lib/hooks/use-customers";
import { useItemOptions } from "@/lib/hooks/use-items";

interface OrdersResponse {
  orders: Order[];
  total: number;
  totals: OrderTotals;
  page: number;
  pageSize: number;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error("Failed to load orders");
  return r.json();
});

const todayIso = () => new Date().toISOString().slice(0, 10);

interface DraftOrder {
  key: string;
  orderDate: string;
  customerId: string;
  item: string;
  pieces: string;
  weightIn: string;
  weightOut: string;
  makingCharge: string;
  touch: string;
}

function newDraft(): DraftOrder {
  return {
    key: `draft-${nanoid()}`,
    orderDate: todayIso(),
    customerId: "",
    item: "Ring",
    pieces: "1",
    weightIn: "0.000",
    weightOut: "0.000",
    makingCharge: "0.000",
    touch: "0",
  };
}

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];

export function OrderRegistryTable() {
  const [filters, setFilters] = React.useState<OrderFiltersState>({
    search: "",
    customerId: "",
    item: "",
    dateRange: {},
  });
  const [sortBy, setSortBy] = React.useState<string>("orderDate");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(100);
  const [draft, setDraft] = React.useState<DraftOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Order | null>(null);
  const [quickAddCustomer, setQuickAddCustomer] = React.useState<{ open: boolean; initialName: string }>({
    open: false,
    initialName: "",
  });

  const cellRefs: CellRefMap = React.useRef(new Map());
  const navigate = useCellNavigation(cellRefs);
  const { customers, refresh: refreshCustomers } = useCustomers();
  const itemOptions = useItemOptions();

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.customerId) params.set("customerId", filters.customerId);
    if (filters.item) params.set("item", filters.item);
    if (filters.dateRange.from) params.set("dateFrom", filters.dateRange.from);
    if (filters.dateRange.to) params.set("dateTo", filters.dateRange.to);
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return params.toString();
  }, [filters, sortBy, sortDir, page, pageSize]);

  const { data, mutate, isLoading } = useSWR<OrdersResponse>(`/api/orders?${queryString}`, fetcher, {
    keepPreviousData: true,
  });

  const orders = React.useMemo(() => data?.orders ?? [], [data]);
  const rowOrder = React.useMemo(
    () => [...(draft ? [draft.key] : []), ...orders.map((o) => o.id)],
    [draft, orders],
  );

  function updateFilters(next: OrderFiltersState) {
    setFilters(next);
    setPage(1);
  }

  function toggleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  }

  async function commitField(order: Order, field: string, rawValue: string) {
    try {
      let payload: Record<string, unknown> = { [field]: rawValue };

      // Clearing 2nd polishing step: empty string → null
      if ((field === "weightIn2" || field === "weightOut2") && rawValue === "") {
        payload = { weightIn2: null, weightOut2: null };
      }

      if (field === "weightOut" || field === "weightIn") {
        const weightIn = field === "weightIn" ? Number(rawValue) : Number(order.weightIn);
        const weightOut = field === "weightOut" ? Number(rawValue) : Number(order.weightOut);
        if (weightOut > weightIn) {
          const confirmed = window.confirm(
            "Weight Out exceeds Weight In. This is unusual - save this order anyway?",
          );
          if (!confirmed) {
            mutate();
            return;
          }
          payload.weightExceedsConfirmed = true;
        }
      }
      if (field === "pieces") payload.pieces = Number(rawValue);

      const result = await api.patch<{ order: Order; warnings: string[] }>(
        `/api/orders/${order.id}`,
        payload,
      );
      result.warnings?.forEach((w) => toast.warning(w));
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save that change.");
      mutate();
    }
  }

  async function submitDraft(customerId: string) {
    if (!draft) return;
    try {
      const result = await api.post<{ order: Order; warnings: string[] }>("/api/orders", {
        orderDate: draft.orderDate,
        customerId,
        item: draft.item,
        pieces: Number(draft.pieces),
        weightIn: draft.weightIn,
        weightOut: draft.weightOut,
        makingCharge: draft.makingCharge,
        touch: draft.touch,
      });
      result.warnings?.forEach((w) => toast.warning(w));
      toast.success(`Order ${result.order.orderNumber} added.`);
      setDraft(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add this order.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/orders/${deleteTarget.id}`);
      toast.success("Order deleted.");
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete this order.");
    }
  }

  function handleExport() {
    const url = `/api/orders/export?${queryString}`;
    window.open(url, "_blank");
  }

  function handlePrint() {
    window.print();
  }

  const columns = React.useMemo<ColumnDef<Order>[]>(
    () => [
      {
        id: "orderDate",
        header: "Date",
        size: 120,
        cell: ({ row }) => (
          <DateInput
            value={row.original.orderDate}
            onChange={(v) => commitField(row.original, "orderDate", v)}
            className="h-8 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:rounded-md focus-visible:border-input"
          />
        ),
      },
      {
        id: "customerName",
        header: "Customer",
        size: 200,
        cell: ({ row }) => (
          <Combobox
            className="h-8 rounded-none border-0 bg-transparent shadow-none hover:bg-accent"
            options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
            value={row.original.customerId}
            onChange={(v) => commitField(row.original, "customerId", v)}
            onCreateNew={(typed) => setQuickAddCustomer({ open: true, initialName: typed })}
            createNewLabel="Add new customer"
          />
        ),
      },
      {
        id: "item",
        header: "Item",
        size: 150,
        cell: ({ row }) => (
          <GridTextInput
            rowId={row.original.id}
            columnKey="item"
            refs={cellRefs}
            rowOrder={rowOrder}
            onNavigate={navigate}
            value={row.original.item}
            onCommit={(v) => commitField(row.original, "item", v)}
            list="jp-item-options"
          />
        ),
      },
      {
        id: "pieces",
        header: "Pieces",
        size: 80,
        cell: ({ row }) => (
          <GridTextInput
            rowId={row.original.id}
            columnKey="pieces"
            refs={cellRefs}
            rowOrder={rowOrder}
            onNavigate={navigate}
            value={String(row.original.pieces)}
            onCommit={(v) => commitField(row.original, "pieces", v)}
            type="number"
            align="right"
            min="0"
          />
        ),
      },
      {
        id: "weightIn",
        header: "Wt In 1",
        size: 100,
        cell: ({ row }) => (
          <GridTextInput
            rowId={row.original.id}
            columnKey="weightIn"
            refs={cellRefs}
            rowOrder={rowOrder}
            onNavigate={navigate}
            value={row.original.weightIn}
            onCommit={(v) => commitField(row.original, "weightIn", v)}
            type="number"
            align="right"
            step="0.001"
            min="0"
          />
        ),
      },
      {
        id: "weightOut",
        header: "Wt Out 1",
        size: 100,
        cell: ({ row }) => (
          <GridTextInput
            rowId={row.original.id}
            columnKey="weightOut"
            refs={cellRefs}
            rowOrder={rowOrder}
            onNavigate={navigate}
            value={row.original.weightOut}
            onCommit={(v) => commitField(row.original, "weightOut", v)}
            type="number"
            align="right"
            step="0.001"
            min="0"
          />
        ),
      },
      {
        id: "weightIn2",
        header: "Wt In 2",
        size: 100,
        cell: ({ row }) => {
          const has2 = row.original.weightIn2 != null;
          if (!has2) return <div className="h-8" />;
          return (
            <GridTextInput
              rowId={row.original.id}
              columnKey="weightIn2"
              refs={cellRefs}
              rowOrder={rowOrder}
              onNavigate={navigate}
              value={row.original.weightIn2 ?? "0.000"}
              onCommit={(v) => commitField(row.original, "weightIn2", v)}
              type="number"
              align="right"
              step="0.001"
              min="0"
            />
          );
        },
      },
      {
        id: "weightOut2",
        header: "Wt Out 2",
        size: 100,
        cell: ({ row }) => {
          const has2 = row.original.weightIn2 != null;
          if (!has2) return <div className="h-8" />;
          return (
            <GridTextInput
              rowId={row.original.id}
              columnKey="weightOut2"
              refs={cellRefs}
              rowOrder={rowOrder}
              onNavigate={navigate}
              value={row.original.weightOut2 ?? "0.000"}
              onCommit={(v) => commitField(row.original, "weightOut2", v)}
              type="number"
              align="right"
              step="0.001"
              min="0"
            />
          );
        },
      },
      {
        id: "makingCharge",
        header: "Making Charge",
        size: 130,
        cell: ({ row }) => {
          if (row.original.weightIn2 != null) {
            return <ReadOnlyCell value={row.original.makingCharge} className="text-muted-foreground bg-muted/20" />;
          }
          return (
            <GridTextInput
              rowId={row.original.id}
              columnKey="makingCharge"
              refs={cellRefs}
              rowOrder={rowOrder}
              onNavigate={navigate}
              value={row.original.makingCharge}
              onCommit={(v) => commitField(row.original, "makingCharge", v)}
              type="number"
              align="right"
              step="0.001"
              min="0"
            />
          );
        },
      },
      {
        id: "loss",
        header: "Loss",
        size: 90,
        cell: ({ row }) => (
          <ReadOnlyCell value={row.original.loss} className={cn(Number(row.original.loss) < 0 && "text-destructive")} />
        ),
      },
      {
        id: "touch",
        header: "Touch",
        size: 80,
        cell: ({ row }) => (
          <GridTextInput
            rowId={row.original.id}
            columnKey="touch"
            refs={cellRefs}
            rowOrder={rowOrder}
            onNavigate={navigate}
            value={row.original.touch}
            onCommit={(v) => commitField(row.original, "touch", v)}
            type="number"
            align="right"
            step="0.01"
            min="0"
          />
        ),
      },
      {
        id: "fineTotal",
        header: "Fine Total",
        size: 100,
        cell: ({ row }) => <ReadOnlyCell value={row.original.fineTotal} emphasize />,
      },
      {
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-1.5 text-xs font-medium",
                row.original.weightIn2 != null
                  ? "text-amber-600 hover:text-amber-700"
                  : "text-muted-foreground hover:text-primary",
              )}
              onClick={() => {
                if (row.original.weightIn2 != null) {
                  commitField(row.original, "weightIn2", "");
                  commitField(row.original, "weightOut2", "");
                } else {
                  commitField(row.original, "weightIn2", "0.000");
                  commitField(row.original, "weightOut2", "0.000");
                }
              }}
              title={row.original.weightIn2 != null ? "Remove 2nd polishing step" : "Add 2nd polishing step"}
            >
              {row.original.weightIn2 != null ? "−2nd" : "+2nd"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
              onClick={() => setDeleteTarget(row.original)}
              aria-label="Delete order"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customers, rowOrder],
  );


  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
  });

  const sortableColumns = new Set([
    "orderDate",
    "customerName",
    "item",
    "pieces",
    "weightIn",
    "weightOut",
    "fineTotal",
  ]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <datalist id="jp-item-options">
        {itemOptions.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>

      <OrderFiltersBar
        filters={filters}
        onChange={updateFilters}
        onAddOrder={() => setDraft(newDraft())}
        onExport={handleExport}
        onPrint={handlePrint}
        resultCount={data?.total}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <Table style={{ width: table.getTotalSize() }}>
          <TableHeader className="sticky top-0 z-10 bg-table-header shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sortable = sortableColumns.has(header.id);
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize(), position: "relative" }}
                      className={cn(sortable && "cursor-pointer select-none")}
                      onClick={sortable ? () => toggleSort(header.id) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable &&
                          (sortBy === header.id ? (
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          ))}
                      </span>
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40"
                      />
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {draft && (
              <TableRow className="group bg-accent/30">
                <TableCell style={{ width: 120 }}>
                  <DateInput
                    value={draft.orderDate}
                    onChange={(v) => setDraft({ ...draft, orderDate: v })}
                    className="h-8 rounded-none border-0 bg-transparent px-2 shadow-none"
                  />
                </TableCell>
                <TableCell style={{ width: 200 }}>
                  <Combobox
                    className="h-8 rounded-none border-0 bg-transparent shadow-none"
                    options={customers.map((c) => ({ value: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
                    value={draft.customerId || null}
                    onChange={(v) => submitDraft(v)}
                    onCreateNew={(typed) => setQuickAddCustomer({ open: true, initialName: typed })}
                    createNewLabel="Add new customer"
                    placeholder="Select customer to start..."
                    autoOpen
                  />
                </TableCell>
                <TableCell colSpan={8} className="text-xs text-muted-foreground">
                  Pick a customer to create this order - the rest of the row will be editable right after.
                </TableCell>
                <TableCell style={{ width: 44 }}>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDraft(null)} aria-label="Cancel new order">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && orders.length === 0 && !draft && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                  No orders yet. Click <span className="font-medium">+ Add Order</span> above to create the first one.
                </TableCell>
              </TableRow>
            )}

            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="group">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TotalsFooter totals={data?.totals} />

      <div className="flex items-center justify-between border-t bg-card px-3 py-1.5 text-xs no-print">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-7 rounded-md border border-input bg-background px-1.5"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <DeleteOrderDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        orderLabel={deleteTarget ? `${deleteTarget.orderNumber} - ${deleteTarget.customerNameSnapshot} - ${deleteTarget.item}` : undefined}
      />

      <CustomerFormDialog
        open={quickAddCustomer.open}
        onOpenChange={(open) => setQuickAddCustomer((s) => ({ ...s, open }))}
        initialName={quickAddCustomer.initialName}
        onSaved={async (customer) => {
          await refreshCustomers();
          if (draft) submitDraft(customer.id);
        }}
      />
    </div>
  );
}

function TotalsFooter({ totals }: { totals?: OrderTotals }) {
  if (!totals) return null;
  return (
    <div className="grid shrink-0 grid-cols-[120px_200px_150px_80px_100px_100px_100px_100px_130px_90px_80px_100px_80px] border-t-2 border-primary/40 bg-table-totals text-xs font-semibold">
      <div className="col-span-3 flex items-center px-3 py-1.5">TOTAL</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalPieces}</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalWeightIn}</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalWeightOut}</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalWeightIn2 || "0.000"}</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalWeightOut2 || "0.000"}</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalMakingCharge}</div>
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalLoss}</div>
      <div className="px-3 py-1.5" />
      <div className="flex items-center justify-end px-3 py-1.5 tabular-nums">{totals.totalFineTotal}</div>
      <div />
    </div>
  );
}
