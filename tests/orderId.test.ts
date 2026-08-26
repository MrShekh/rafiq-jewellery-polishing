import { describe, expect, it } from "vitest";

import { formatOrderNumber, datePrefixForOrderNumber } from "@/lib/ids/orderId";

describe("order number formatting", () => {
  it("matches the brief's example shape: ORD-20260825-0001", () => {
    const date = new Date(2026, 7, 25); // August 25 2026 (month is 0-indexed)
    expect(formatOrderNumber(date, 1)).toBe("ORD-20260825-0001");
  });

  it("pads the sequence to 4 digits", () => {
    const date = new Date(2026, 0, 5);
    expect(formatOrderNumber(date, 42)).toBe("ORD-20260105-0042");
  });

  it("prefix helper matches the start of formatOrderNumber's output", () => {
    const date = new Date(2026, 7, 25);
    const full = formatOrderNumber(date, 7);
    expect(full.startsWith(datePrefixForOrderNumber(date))).toBe(true);
  });
});
