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
  precision: PrecisionPolicy = DEFAULT_PRECISION,
  formulaVersion: FormulaVersion = "v1-standard",
): Decimal {
  const formula = resolveFormulaSet(formulaVersion);
  const raw = formula.loss({
    weightIn: toDecimal(weightIn),
    weightOut: toDecimal(weightOut),
    makingCharge: toDecimal(makingCharge),
  });
  return round(raw, precision.weight);
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
}

export interface OrderTotals {
  totalPieces: number;
  totalWeightIn: string;
  totalWeightOut: string;
  totalMakingCharge: string;
  totalLoss: string;
  totalFineTotal: string;
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

  for (const order of ordersList) {
    totalPieces += order.pieces;
    totalWeightIn = totalWeightIn.plus(toDecimal(order.weightIn));
    totalWeightOut = totalWeightOut.plus(toDecimal(order.weightOut));
    totalMakingCharge = totalMakingCharge.plus(toDecimal(order.makingCharge));
    totalLoss = totalLoss.plus(toDecimal(order.loss));
    totalFineTotal = totalFineTotal.plus(toDecimal(order.fineTotal));
  }

  return {
    totalPieces,
    totalWeightIn: round(totalWeightIn, precision.weight).toFixed(precision.weight),
    totalWeightOut: round(totalWeightOut, precision.weight).toFixed(precision.weight),
    totalMakingCharge: round(totalMakingCharge, precision.weight).toFixed(precision.weight),
    totalLoss: round(totalLoss, precision.weight).toFixed(precision.weight),
    totalFineTotal: round(totalFineTotal, precision.fine).toFixed(precision.fine),
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
