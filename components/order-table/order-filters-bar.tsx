"use client";

import { Search, Plus, Download, Printer, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateFilter, type DateRange } from "@/components/order-table/date-filter";
import { useCustomers } from "@/lib/hooks/use-customers";
import { useItemOptions } from "@/lib/hooks/use-items";

export interface OrderFiltersState {
  search: string;
  customerId: string; // "" = all
  item: string; // "" = all
  dateRange: DateRange;
}

export function OrderFiltersBar({
  filters,
  onChange,
  onAddOrder,
  onExport,
  onPrint,
  resultCount,
}: {
  filters: OrderFiltersState;
  onChange: (filters: OrderFiltersState) => void;
  onAddOrder: () => void;
  onExport: () => void;
  onPrint: () => void;
  resultCount?: number;
}) {
  const { customers } = useCustomers();
  const items = useItemOptions();

  const hasActiveFilters = !!(filters.search || filters.customerId || filters.item || filters.dateRange.from || filters.dateRange.to);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2 no-print">
      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search customer, item, or order ID..."
          className="h-8 pl-8"
        />
      </div>

      <Select
        value={filters.customerId || "__all__"}
        onValueChange={(v) => onChange({ ...filters, customerId: v === "__all__" ? "" : v })}
      >
        <SelectTrigger className="h-8 w-44"><SelectValue placeholder="All customers" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All customers</SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.item || "__all__"}
        onValueChange={(v) => onChange({ ...filters, item: v === "__all__" ? "" : v })}
      >
        <SelectTrigger className="h-8 w-36"><SelectValue placeholder="All items" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All items</SelectItem>
          {items.map((i) => (
            <SelectItem key={i} value={i}>{i}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DateFilter value={filters.dateRange} onChange={(dateRange) => onChange({ ...filters, dateRange })} />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-muted-foreground"
          onClick={() => onChange({ search: "", customerId: "", item: "", dateRange: {} })}
        >
          <X className="h-3.5 w-3.5" /> Clear
        </Button>
      )}

      {typeof resultCount === "number" && (
        <span className="text-xs text-muted-foreground">{resultCount.toLocaleString()} order(s)</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onExport}>
          <Download className="h-3.5 w-3.5" /> Export to Excel
        </Button>
        <Button size="sm" className="gap-1.5" onClick={onAddOrder}>
          <Plus className="h-3.5 w-3.5" /> Add Order
        </Button>
      </div>
    </div>
  );
}
