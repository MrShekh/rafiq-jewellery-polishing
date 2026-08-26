"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Shared keyboard behavior for every editable grid cell (brief section 12):
 *   Enter   - commit and move focus to the same column, next row (like Excel)
 *   Tab     - browser-native: commits on blur and moves to the next
 *             focusable element, which is the next cell in DOM order
 *   Escape  - revert to the last committed value
 *   Up/Down - move focus to the same column, previous/next row ("arrow-key
 *             navigation where practical" - full 2D grid arrow support
 *             isn't attempted since Tab/Enter already cover the primary
 *             fast-entry flow this app is built around)
 *
 * `cellKey`/`registerRef`/`focusCell` implement that vertical movement: each
 * cell registers its input under a `${rowId}:${columnKey}` key in a shared
 * ref map owned by the table, and Up/Down/Enter just look up the
 * neighboring row's key in that same map.
 */
export type CellRefMap = React.MutableRefObject<Map<string, HTMLInputElement>>;

export function registerCellRef(map: CellRefMap, key: string) {
  return (el: HTMLInputElement | null) => {
    if (el) map.current.set(key, el);
    else map.current.delete(key);
  };
}

export function useCellNavigation(refs: CellRefMap) {
  return React.useCallback(
    (currentKey: string, direction: "up" | "down", columnKey: string, rowOrder: string[]) => {
      const idx = rowOrder.indexOf(currentKey);
      if (idx === -1) return;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      const targetRowId = rowOrder[targetIdx];
      if (!targetRowId) return;
      const target = refs.current.get(`${targetRowId}:${columnKey}`);
      target?.focus();
      target?.select?.();
    },
    [refs],
  );
}

interface BaseCellProps {
  rowId: string;
  columnKey: string;
  refs: CellRefMap;
  rowOrder: string[];
  onNavigate: (currentKey: string, direction: "up" | "down", columnKey: string, rowOrder: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function GridTextInput({
  rowId,
  columnKey,
  refs,
  rowOrder,
  onNavigate,
  value,
  onCommit,
  type = "text",
  align = "left",
  disabled,
  className,
  list,
  step,
  min,
  placeholder,
}: BaseCellProps & {
  value: string;
  onCommit: (value: string) => void;
  type?: "text" | "number";
  align?: "left" | "right";
  list?: string;
  step?: string;
  min?: string;
  placeholder?: string;
}) {
  const [local, setLocal] = React.useState(value);
  const key = `${rowId}:${columnKey}`;

  React.useEffect(() => setLocal(value), [value]);

  return (
    <Input
      ref={registerCellRef(refs, key)}
      value={local}
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      step={step}
      min={min}
      list={list}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (local !== value) onCommit(local);
          onNavigate(key, "down", columnKey, rowOrder);
        } else if (e.key === "Escape") {
          setLocal(value);
          e.currentTarget.blur();
        } else if (e.key === "ArrowDown" && (e.metaKey || e.altKey)) {
          e.preventDefault();
          onNavigate(key, "down", columnKey, rowOrder);
        } else if (e.key === "ArrowUp" && (e.metaKey || e.altKey)) {
          e.preventDefault();
          onNavigate(key, "up", columnKey, rowOrder);
        }
      }}
      className={cn(
        "h-8 rounded-none border-0 border-b border-transparent bg-transparent px-2 shadow-none focus-visible:rounded-md focus-visible:border-input focus-visible:ring-1",
        align === "right" && "text-right tabular-nums",
        className,
      )}
    />
  );
}

/** Non-editable, calculated cell (Loss / Fine Total - section 7: "This must
 * not normally be manually editable"). */
export function ReadOnlyCell({
  value,
  className,
  emphasize,
}: {
  value: string;
  className?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-8 items-center justify-end px-3 tabular-nums text-muted-foreground",
        emphasize && "font-medium text-foreground",
        className,
      )}
    >
      {value}
    </div>
  );
}
