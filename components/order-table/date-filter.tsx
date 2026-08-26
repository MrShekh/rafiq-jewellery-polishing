"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import {
  format,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
} from "date-fns";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateInput } from "@/components/ui/date-input";
import { Separator } from "@/components/ui/separator";

export interface DateRange {
  from?: string;
  to?: string;
}

type Preset = "today" | "yesterday" | "week" | "month" | "custom" | "all";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function presetRange(preset: Preset): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: iso(y), to: iso(y) };
    }
    case "week":
      return { from: iso(startOfWeek(now, { weekStartsOn: 1 })), to: iso(now) };
    case "month":
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
    default:
      return {};
  }
}

/** Date filter (section 16): Today / Yesterday / This week / This month /
 * Custom range, as a single popover control. */
export function DateFilter({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = React.useState(false);

  const label = React.useMemo(() => {
    if (!value.from && !value.to) return "All dates";
    if (value.from === value.to) return value.from;
    return `${value.from ?? "..."} to ${value.to ?? "..."}`;
  }, [value]);

  function choose(preset: Preset) {
    onChange(presetRange(preset));
    if (preset !== "custom") setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 font-normal">
          <CalendarRange className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="grid grid-cols-2 gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => choose("today")}>Today</Button>
          <Button variant="secondary" size="sm" onClick={() => choose("yesterday")}>Yesterday</Button>
          <Button variant="secondary" size="sm" onClick={() => choose("week")}>This week</Button>
          <Button variant="secondary" size="sm" onClick={() => choose("month")}>This month</Button>
          <Button variant="secondary" size="sm" className="col-span-2" onClick={() => choose("all")}>
            All dates
          </Button>
        </div>
        <Separator className="my-3" />
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="flex items-center gap-2">
            <DateInput value={value.from} onChange={(v) => onChange({ ...value, from: v })} />
            <span className="text-xs text-muted-foreground">to</span>
            <DateInput value={value.to} onChange={(v) => onChange({ ...value, to: v })} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
