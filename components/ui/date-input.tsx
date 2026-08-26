import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Native HTML date input, styled to match the rest of the form controls.
 *
 * We deliberately use the browser/OS-native date picker (via
 * `<input type="date">`) rather than a custom calendar popover component:
 * it is fully keyboard-typeable (fits the "click cell, type value, Tab"
 * workflow this app is built around), needs no extra dependency, and
 * Chromium (which ships inside Electron) renders a perfectly good native
 * picker for the mouse-driven case too.
 *
 * Value/onChange use plain ISO "YYYY-MM-DD" strings.
 */
export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string | null | undefined;
  onChange: (value: string) => void;
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
DateInput.displayName = "DateInput";

export { DateInput };
