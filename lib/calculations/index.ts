import Decimal from "decimal.js";

/**
 * Calculation service (brief section 45): every jewellery-weight formula in
 * the app lives here, nowhere else. UI components call these functions;
 * they never do `weightIn - weightOut` inline. That keeps the business
 * rules testable, reusable between the client and the API routes (this
 * module has no Node-only imports, so it runs identically in the browser
 * and on the server), and gives us exactly one place to change if/when the
 * client redefines what "Making Charge" or "Touch" means (section 43).
 *
 * Precision policy (section 8/43, configurable):
 *   - Weight-shaped values (Weight In, Weight Out, Making Charge, Loss):
 *     3 decimal places.
 *   - Touch: 2 decimal places by default (a percentage-like figure).
 *   - Fine Total: 3 decimal places.
 * All arithmetic runs through decimal.js, never native `number` math, so
 * results are exact (no 0.1 + 0.2 = 0.30000000000000004).
 */

export interface PrecisionPolicy {
  /** Decimal places for Weight In / Weight Out / Making Charge / Loss. */
  weight: number;
  /** Decimal places for Touch. */
  touch: number;
  /** Decimal places for Fine Total. */
  fine: number;
}

export const DEFAULT_PRECISION: PrecisionPolicy = {
  weight: 3,
  touch: 2,
  fine: 3,
};

/**
 * The two formulas the client confirmed as current business rules
 * (section 43). Both are exposed as named, swappable strategies so a
 * future formula change is a config change, not a rewrite - see
 * `resolveFormulaSet` and lib/settings/formula.ts on the server side for
 * how a business could eventually pick an alternate formula from Settings.
 */
export type FormulaVersion = "v1-standard";

export interface FormulaSet {
  version: FormulaVersion;
  label: string;
  /** Loss = Weight In - Weight Out - Making Charge */
  loss(input: { weightIn: Decimal; weightOut: Decimal; makingCharge: Decimal }): Decimal;
  /** Fine Total = Loss x Touch / 100 */
  fineTotal(input: { loss: Decimal; touch: Decimal }): Decimal;
}

export const FORMULA_SETS: Record<FormulaVersion, FormulaSet> = {
  "v1-standard": {
    version: "v1-standard",
    label: "Standard (Loss = Weight In - Weight Out - Making Charge; Fine = Loss x Touch / 100)",
    loss: ({ weightIn, weightOut, makingCharge }) => weightIn.minus(weightOut).minus(makingCharge),
    fineTotal: ({ loss, touch }) => loss.times(touch).dividedBy(100),
  },
};

export function resolveFormulaSet(version?: string | null): FormulaSet {
  if (version && version in FORMULA_SETS) {
    return FORMULA_SETS[version as FormulaVersion];
  }
  return FORMULA_SETS["v1-standard"];
}

type DecimalInput = Decimal | string | number;

function toDecimal(value: DecimalInput): Decimal {
  const d = value instanceof Decimal ? value : new Decimal(value === "" || value == null ? 0 : value);
  if (!d.isFinite()) {
    throw new Error("Invalid numeric value supplied to calculation service");
  }
  return d;
}

function round(value: Decimal, places: number): Decimal {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

export interface OrderCalculationInput {
  weightIn: DecimalInput;
  weightOut: DecimalInput;
  makingCharge: DecimalInput;
  touch: DecimalInput;
  weightIn2?: DecimalInput | null;
  weightOut2?: DecimalInput | null;
  precision?: PrecisionPolicy;
  formulaVersion?: FormulaVersion;
}

export interface OrderCalculationResult {
  loss: Decimal;
  fineTotal: Decimal;
  lossString: string;
  fineTotalString: string;
  /** True when Loss came out negative - callers should surface a validation warning, not silently accept it (section 10). */
  isLossNegative: boolean;
}

export function calculateLoss(
  weightIn: DecimalInput,
  weightOut: DecimalInput,
  makingCharge: DecimalInput,
  weightIn2?: DecimalInput | null,
  weightOut2?: DecimalInput | null,
  precision: PrecisionPolicy = DEFAULT_PRECISION,
  formulaVersion: FormulaVersion = "v1-standard",
): Decimal {
  const formula = resolveFormulaSet(formulaVersion);
  const raw1 = formula.loss({
    weightIn: toDecimal(weightIn),
    weightOut: toDecimal(weightOut),
    makingCharge: toDecimal(makingCharge),
  });

  let raw2 = new Decimal(0);
  if (weightIn2 != null && weightOut2 != null && weightIn2 !== "" && weightOut2 !== "") {
    raw2 = toDecimal(weightIn2).minus(toDecimal(weightOut2));
  }

  return round(raw1.plus(raw2), precision.weight);
}

export function calculateFineTotal(
  loss: DecimalInput,
  touch: DecimalInput,
  precision: PrecisionPolicy = DEFAULT_PRECISION,
  formulaVersion: FormulaVersion = "v1-standard",
): Decimal {
  const formula = resolveFormulaSet(formulaVersion);
  const raw = formula.fineTotal({ loss: toDecimal(loss), touch: toDecimal(touch) });
  return round(raw, precision.fine);
}

/** Runs both formulas and returns display-ready strings alongside the Decimal values. */
export function calculateOrder(input: OrderCalculationInput): OrderCalculationResult {
  const precision = input.precision ?? DEFAULT_PRECISION;
  const formulaVersion = input.formulaVersion ?? "v1-standard";

  const loss = calculateLoss(
    input.weightIn,
    input.weightOut,
    input.makingCharge,
    input.weightIn2,
    input.weightOut2,
    precision,
    formulaVersion,
  );
  const fineTotal = calculateFineTotal(loss, input.touch, precision, formulaVersion);

  return {
    loss,
    fineTotal,
    lossString: loss.toFixed(precision.weight),
    fineTotalString: fineTotal.toFixed(precision.fine),
    isLossNegative: loss.isNegative(),
  };
}

export interface OrderLike {
  pieces: number;
  weightIn: DecimalInput;
  weightOut: DecimalInput;
  makingCharge: DecimalInput;
  loss: DecimalInput;
  fineTotal: DecimalInput;
  weightIn2?: DecimalInput | null;
  weightOut2?: DecimalInput | null;
  pieces2?: number | null;
  /** How much of fineTotal has already been settled/cleared. Defaults to 0 for orders created before clearing existed. */
  clearedAmount?: DecimalInput | null;
}

export interface OrderTotals {
  totalPieces: number;
  totalWeightIn: string;
  totalWeightOut: string;
  totalMakingCharge: string;
  totalLoss: string;
  /** Sum of each order's *outstanding* fine (fineTotal - clearedAmount), not the raw historical total. */
  totalFineTotal: string;
  totalWeightIn2: string;
  totalWeightOut2: string;
  totalPieces2: number;
  /** Sum of clearedAmount across orders - how much fine has already been settled/returned to customers. Shown alongside totalFineTotal so a shrinking "Fine Total" isn't the only signal. */
  totalCleared: string;
}

/** Fine still owed on one order: fineTotal minus whatever has already been cleared, floored at zero. */
export function outstandingFine(
  fineTotal: DecimalInput,
  clearedAmount: DecimalInput | null | undefined,
  precision: PrecisionPolicy = DEFAULT_PRECISION,
): Decimal {
  const remaining = toDecimal(fineTotal).minus(toDecimal(clearedAmount ?? 0));
  return round(remaining.isNegative() ? new Decimal(0) : remaining, precision.fine);
}

/** Sums a page/filtered-set of orders for the sticky totals row (section 11) and dashboard summaries. */
export function calculateOrderTotals(
  ordersList: OrderLike[],
  precision: PrecisionPolicy = DEFAULT_PRECISION,
): OrderTotals {
  let totalPieces = 0;
  let totalWeightIn = new Decimal(0);
  let totalWeightOut = new Decimal(0);
  let totalMakingCharge = new Decimal(0);
  let totalLoss = new Decimal(0);
  let totalFineTotal = new Decimal(0);
  let totalWeightIn2 = new Decimal(0);
  let totalWeightOut2 = new Decimal(0);
  let totalPieces2 = 0;
  let totalCleared = new Decimal(0);

  for (const order of ordersList) {
    totalPieces += order.pieces;
    totalWeightIn = totalWeightIn.plus(toDecimal(order.weightIn));
    totalWeightOut = totalWeightOut.plus(toDecimal(order.weightOut));
    totalMakingCharge = totalMakingCharge.plus(toDecimal(order.makingCharge));
    totalLoss = totalLoss.plus(toDecimal(order.loss));
    totalFineTotal = totalFineTotal.plus(outstandingFine(order.fineTotal, order.clearedAmount, precision));
    totalCleared = totalCleared.plus(toDecimal(order.clearedAmount ?? 0));
    if (order.weightIn2 != null && order.weightIn2 !== "") {
      totalWeightIn2 = totalWeightIn2.plus(toDecimal(order.weightIn2));
    }
    if (order.weightOut2 != null && order.weightOut2 !== "") {
      totalWeightOut2 = totalWeightOut2.plus(toDecimal(order.weightOut2));
    }
    if (order.pieces2 != null) {
      totalPieces2 += order.pieces2;
    }
  }

  return {
    totalPieces,
    totalWeightIn: round(totalWeightIn, precision.weight).toFixed(precision.weight),
    totalWeightOut: round(totalWeightOut, precision.weight).toFixed(precision.weight),
    totalMakingCharge: round(totalMakingCharge, precision.weight).toFixed(precision.weight),
    totalLoss: round(totalLoss, precision.weight).toFixed(precision.weight),
    totalFineTotal: round(totalFineTotal, precision.fine).toFixed(precision.fine),
    totalWeightIn2: round(totalWeightIn2, precision.weight).toFixed(precision.weight),
    totalWeightOut2: round(totalWeightOut2, precision.weight).toFixed(precision.weight),
    totalPieces2,
    totalCleared: round(totalCleared, precision.fine).toFixed(precision.fine),
  };
}

export type ClearStatus = "open" | "partial" | "cleared";

/** Derives open/partial/cleared purely from the numbers, so it's always consistent with clearedAmount. */
export function computeClearStatus(
  fineTotal: DecimalInput,
  clearedAmount: DecimalInput,
  precision: PrecisionPolicy = DEFAULT_PRECISION,
): ClearStatus {
  const fine = round(toDecimal(fineTotal), precision.fine);
  const cleared = round(toDecimal(clearedAmount), precision.fine);
  if (cleared.lte(0)) return "open";
  if (cleared.gte(fine)) return "cleared";
  return "partial";
}

/** If an order's weights/touch are edited after it was partially/fully cleared, clearedAmount can't exceed the new fineTotal. */
export function reconcileClearAfterEdit(
  fineTotal: DecimalInput,
  clearedAmount: DecimalInput,
  precision: PrecisionPolicy = DEFAULT_PRECISION,
): { clearedAmount: string; status: ClearStatus } {
  const fine = toDecimal(fineTotal);
  let cleared = toDecimal(clearedAmount);
  if (cleared.gt(fine)) cleared = fine;
  cleared = round(cleared, precision.fine);
  return { clearedAmount: cleared.toFixed(precision.fine), status: computeClearStatus(fine, cleared, precision) };
}

export interface ClearResult {
  clearedAmount: string;
  status: ClearStatus;
  remaining: string;
}

/**
 * Applies a full or partial fine-clear. Throws a plain Error (repository
 * layer maps it to a 409) for a zero/negative amount or an amount that
 * would overpay the order, so the client/customer numbers never desync.
 */
export function applyFineClear(
  fineTotal: DecimalInput,
  alreadyCleared: DecimalInput,
  amount: "full" | DecimalInput,
  precision: PrecisionPolicy = DEFAULT_PRECISION,
): ClearResult {
  const fine = toDecimal(fineTotal);
  const cleared = toDecimal(alreadyCleared);
  const remainingBefore = fine.minus(cleared);
  const toApply = amount === "full" ? remainingBefore : toDecimal(amount);

  const tolerance = new Decimal(1).dividedBy(new Decimal(10).pow(precision.fine));
  if (toApply.lte(0)) {
    throw new Error("Clear amount must be greater than zero.");
  }
  if (toApply.gt(remainingBefore.plus(tolerance))) {
    throw new Error("Clear amount exceeds the remaining due amount.");
  }

  let newCleared = cleared.plus(toApply);
  if (newCleared.gt(fine)) newCleared = fine;
  newCleared = round(newCleared, precision.fine);

  const remaining = round(fine.minus(newCleared), precision.fine);
  return {
    clearedAmount: newCleared.toFixed(precision.fine),
    status: computeClearStatus(fine, newCleared, precision),
    remaining: remaining.isNegative() ? (0).toFixed(precision.fine) : remaining.toFixed(precision.fine),
  };
}

/** Formats a Decimal/string/number for display with a fixed precision, defaulting empty/invalid input to "0.000". */
export function formatDecimal(value: DecimalInput | null | undefined, places: number): string {
  if (value === null || value === undefined || value === "") return (0).toFixed(places);
  try {
    return toDecimal(value).toFixed(places);
  } catch {
    return (0).toFixed(places);
  }
}
