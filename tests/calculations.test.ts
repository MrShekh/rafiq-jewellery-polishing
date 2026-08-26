import { describe, expect, it } from "vitest";

import {
  calculateLoss,
  calculateFineTotal,
  calculateOrder,
  calculateOrderTotals,
  DEFAULT_PRECISION,
} from "@/lib/calculations";

describe("calculateLoss", () => {
  it("matches the worked example from the brief: 25.500 - 25.100 - 0.100 = 0.300", () => {
    const loss = calculateLoss("25.500", "25.100", "0.100");
    expect(loss.toFixed(3)).toBe("0.300");
  });

  it("never produces floating point drift (0.1 + 0.2 style errors)", () => {
    // Weight In - Weight Out - Making Charge chosen so naive float math
    // would produce 0.30000000000000004 instead of exactly 0.3.
    const loss = calculateLoss("0.4", "0.1", "0.0", null, null, { weight: 10, touch: 2, fine: 3 });
    expect(loss.toString()).toBe("0.3");
  });

  it("can be negative, and callers are told so", () => {
    const result = calculateOrder({ weightIn: "10.000", weightOut: "10.000", makingCharge: "0.500", touch: "75" });
    expect(result.isLossNegative).toBe(true);
    expect(result.lossString).toBe("-0.500");
  });
});

describe("calculateFineTotal", () => {
  it("matches the worked example: 0.300 x 75 / 100 = 0.225", () => {
    const fine = calculateFineTotal("0.300", "75");
    expect(fine.toFixed(3)).toBe("0.225");
  });

  it("rounds to the configured fine precision", () => {
    const fine = calculateFineTotal("0.3333", "50", { weight: 3, touch: 2, fine: 2 });
    expect(fine.toFixed(2)).toBe("0.17"); // 0.16665 rounds half-up to 0.17
  });
});

describe("calculateOrder (end to end, brief section 9 example)", () => {
  it("Weight In 25.500 / Weight Out 25.100 / Making Charge 0.100 / Touch 75 -> Loss 0.300, Fine 0.225", () => {
    const result = calculateOrder({
      weightIn: "25.500",
      weightOut: "25.100",
      makingCharge: "0.100",
      touch: "75",
    });
    expect(result.lossString).toBe("0.300");
    expect(result.fineTotalString).toBe("0.225");
    expect(result.isLossNegative).toBe(false);
  });

  it("handles second polishing step: Wt In 1 25.500 / Wt Out 1 25.100 / Making Charge 0.100 / Wt In 2 10.000 / Wt Out 2 9.800 / Touch 75 -> Loss 0.500, Fine 0.375", () => {
    const result = calculateOrder({
      weightIn: "25.500",
      weightOut: "25.100",
      makingCharge: "0.100",
      weightIn2: "10.000",
      weightOut2: "9.800",
      touch: "75",
    });
    expect(result.lossString).toBe("0.500"); // (25.5 - 25.1 - 0.1) + (10 - 9.8) = 0.3 + 0.2 = 0.5
    expect(result.fineTotalString).toBe("0.375"); // 0.5 * 75 / 100 = 0.375
    expect(result.isLossNegative).toBe(false);
  });
});

describe("calculateOrderTotals", () => {
  it("sums multiple orders correctly with exact decimal arithmetic", () => {
    const totals = calculateOrderTotals(
      [
        { pieces: 10, weightIn: "25.500", weightOut: "25.100", makingCharge: "0.100", loss: "0.300", fineTotal: "0.225" },
        { pieces: 5, weightIn: "10.250", weightOut: "10.000", makingCharge: "0.050", loss: "0.200", fineTotal: "0.150" },
        { pieces: 3, weightIn: "0.100", weightOut: "0.100", makingCharge: "0.000", loss: "0.000", fineTotal: "0.000" },
      ],
      DEFAULT_PRECISION,
    );

    expect(totals.totalPieces).toBe(18);
    expect(totals.totalWeightIn).toBe("35.850");
    expect(totals.totalWeightOut).toBe("35.200");
    expect(totals.totalMakingCharge).toBe("0.150");
    expect(totals.totalLoss).toBe("0.500");
    expect(totals.totalFineTotal).toBe("0.375");
  });

  it("returns zeroed totals for an empty order set", () => {
    const totals = calculateOrderTotals([]);
    expect(totals.totalPieces).toBe(0);
    expect(totals.totalWeightIn).toBe("0.000");
    expect(totals.totalFineTotal).toBe("0.000");
  });
});
