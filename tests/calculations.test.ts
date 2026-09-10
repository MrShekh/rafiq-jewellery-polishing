import { describe, expect, it } from "vitest";

import {
  calculateLoss,
  calculateFineTotal,
  calculateOrder,
  calculateOrderTotals,
  applyFineClear,
  computeClearStatus,
  outstandingFine,
  reconcileClearAfterEdit,
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
    expect(result.customerPaysFine).toBe(false);
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

  it("Making Charge > gross loss: Loss is negative but Fine Total is always positive (customer pays karigar)", () => {
    // User's exact example: Wt In 50, Wt Out 45, Making Charge 6 -> gross loss = 5, Loss = -1
    const result = calculateOrder({
      weightIn: "50",
      weightOut: "45",
      makingCharge: "6",
      touch: "75",
    });
    expect(result.lossString).toBe("-1.000");         // Loss is signed: 50 - 45 - 6 = -1
    expect(result.fineTotalString).toBe("0.750");      // |Loss| × Touch / 100 = 1 × 75/100 = 0.750 (always positive)
    expect(result.isLossNegative).toBe(true);
    expect(result.customerPaysFine).toBe(true);
  });

  it("Normal case from user example: Wt In 50, Wt Out 45, Making Charge 2, Touch 75 -> Loss 3, Fine 2.250", () => {
    const result = calculateOrder({
      weightIn: "50",
      weightOut: "45",
      makingCharge: "2",
      touch: "75",
    });
    expect(result.lossString).toBe("3.000");
    expect(result.fineTotalString).toBe("2.250");
    expect(result.isLossNegative).toBe(false);
    expect(result.customerPaysFine).toBe(false);
  });

  it("Making Charge exactly equals gross loss: Loss is zero, Fine Total is zero", () => {
    const result = calculateOrder({
      weightIn: "50",
      weightOut: "45",
      makingCharge: "5",
      touch: "75",
    });
    expect(result.lossString).toBe("0.000");
    expect(result.fineTotalString).toBe("0.000");
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

  it("sums outstanding fine (fineTotal minus clearedAmount), not the raw historical total", () => {
    const totals = calculateOrderTotals(
      [
        { pieces: 1, weightIn: "10", weightOut: "9", makingCharge: "0", loss: "1", fineTotal: "0.750", clearedAmount: "0.250" },
        { pieces: 1, weightIn: "10", weightOut: "9", makingCharge: "0", loss: "1", fineTotal: "0.500", clearedAmount: "0.500" },
        { pieces: 1, weightIn: "10", weightOut: "9", makingCharge: "0", loss: "1", fineTotal: "0.300" }, // no clearedAmount at all (pre-existing order)
      ],
      DEFAULT_PRECISION,
    );
    // (0.750 - 0.250) + (0.500 - 0.500) + (0.300 - 0) = 0.500 + 0.000 + 0.300
    expect(totals.totalFineTotal).toBe("0.800");
    // totalCleared is the companion stat: 0.250 + 0.500 + 0 = 0.750
    expect(totals.totalCleared).toBe("0.750");
  });
});

describe("outstandingFine", () => {
  it("subtracts what has already been cleared", () => {
    expect(outstandingFine("1.000", "0.400").toFixed(3)).toBe("0.600");
  });

  it("floors at zero rather than going negative", () => {
    expect(outstandingFine("1.000", "1.500").toFixed(3)).toBe("0.000");
  });

  it("treats a missing clearedAmount as zero", () => {
    expect(outstandingFine("1.000", undefined).toFixed(3)).toBe("1.000");
  });
});

describe("computeClearStatus", () => {
  it("is open when nothing has been cleared", () => {
    expect(computeClearStatus("1.000", "0")).toBe("open");
  });
  it("is partial when some but not all has been cleared", () => {
    expect(computeClearStatus("1.000", "0.400")).toBe("partial");
  });
  it("is cleared once the cleared amount reaches the fine total", () => {
    expect(computeClearStatus("1.000", "1.000")).toBe("cleared");
  });
});

describe("applyFineClear", () => {
  it("clears a partial amount and reports the new remaining balance", () => {
    const result = applyFineClear("1.000", "0", "0.400");
    expect(result.clearedAmount).toBe("0.400");
    expect(result.status).toBe("partial");
    expect(result.remaining).toBe("0.600");
  });

  it("'full' clears exactly whatever is left, regardless of prior partial clears", () => {
    const result = applyFineClear("1.000", "0.400", "full");
    expect(result.clearedAmount).toBe("1.000");
    expect(result.status).toBe("cleared");
    expect(result.remaining).toBe("0.000");
  });

  it("rejects a zero or negative amount", () => {
    expect(() => applyFineClear("1.000", "0", "0")).toThrow();
    expect(() => applyFineClear("1.000", "0", "-0.100")).toThrow();
  });

  it("rejects clearing more than what remains due", () => {
    expect(() => applyFineClear("1.000", "0.400", "0.700")).toThrow();
  });
});

describe("reconcileClearAfterEdit", () => {
  it("leaves clearedAmount untouched when it still fits under the new fineTotal", () => {
    const result = reconcileClearAfterEdit("1.000", "0.400");
    expect(result.clearedAmount).toBe("0.400");
    expect(result.status).toBe("partial");
  });

  it("clamps clearedAmount down when an edit shrinks fineTotal below what was already cleared", () => {
    // Order was fully cleared at fineTotal 1.000, then weights were edited down to 0.300.
    const result = reconcileClearAfterEdit("0.300", "1.000");
    expect(result.clearedAmount).toBe("0.300");
    expect(result.status).toBe("cleared");
  });
});
