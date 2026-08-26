import { describe, expect, it } from "vitest";

import { orderInputSchema } from "@/lib/validation/order";
import { customerInputSchema } from "@/lib/validation/customer";

const baseOrder = {
  orderDate: "2026-08-25",
  customerId: "cust_1",
  item: "Ring",
  pieces: 10,
  weightIn: "25.500",
  weightOut: "25.100",
  makingCharge: "0.100",
  touch: "75",
};

describe("orderInputSchema", () => {
  it("accepts a valid order", () => {
    const result = orderInputSchema.safeParse(baseOrder);
    expect(result.success).toBe(true);
  });

  it("rejects negative weight", () => {
    const result = orderInputSchema.safeParse({ ...baseOrder, weightIn: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer pieces", () => {
    const result = orderInputSchema.safeParse({ ...baseOrder, pieces: 2.5 });
    expect(result.success).toBe(false);
  });

  it("rejects negative pieces", () => {
    const result = orderInputSchema.safeParse({ ...baseOrder, pieces: -1 });
    expect(result.success).toBe(false);
  });

  it("flags Weight Out > Weight In unless explicitly confirmed", () => {
    const unconfirmed = orderInputSchema.safeParse({ ...baseOrder, weightOut: "30.000" });
    expect(unconfirmed.success).toBe(false);

    const confirmed = orderInputSchema.safeParse({
      ...baseOrder,
      weightOut: "30.000",
      weightExceedsConfirmed: true,
    });
    expect(confirmed.success).toBe(true);
  });

  it("requires a customer to be selected", () => {
    const result = orderInputSchema.safeParse({ ...baseOrder, customerId: "" });
    expect(result.success).toBe(false);
  });
});

describe("customerInputSchema", () => {
  it("requires a name but allows phone/address/notes to be omitted", () => {
    const result = customerInputSchema.safeParse({ name: "ABC Jewellers" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = customerInputSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });
});
