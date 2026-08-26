"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

/**
 * Lightweight searchable dropdown (brief section 7: "Searchable customer
 * dropdown"). Deliberately hand-rolled from Popover + Input rather than
 * pulling in `cmdk`/full Command-menu machinery - the app only needs
 * type-to-filter-a-flat-list, and keeping this dependency-free matters more
 * here than in a bigger app since every extra native-ish dependency is one
 * more thing electron-rebuild has to survive.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyLabel = "No results.",
  onCreateNew,
  createNewLabel = "Add new",
  className,
  disabled,
  autoOpen,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  onCreateNew?: (typedValue: string) => void;
  createNewLabel?: string;
  className?: string;
  disabled?: boolean;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(!!autoOpen);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
    );
  }, [options, query]);

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("h-9 w-full justify-between px-3 font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          // Focus the search box ourselves (not the first list item, which
          // is Radix Popover Content's default) - this integrates with
          // Radix's own focus-trap/dismissable-layer setup instead of
          // racing it with a separate rAF-based focus() call, which was
          // intermittently causing the layer to see focus land "outside"
          // for a frame and immediately close the popover before the user
          // could type anything.
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            className="h-7 border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="max-h-64">
          <div className="p-1">
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyLabel}</div>
            )}
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  option.value === value && "bg-accent",
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{option.label}</span>
                  {option.sublabel && (
                    <span className="truncate text-xs text-muted-foreground">{option.sublabel}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
        {onCreateNew && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => {
                onCreateNew(query);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              {createNewLabel}
              {query.trim() ? `: "${query.trim()}"` : ""}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
