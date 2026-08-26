import { z } from "zod";

/**
 * Validation rules from brief section 10. These schemas are shared by the
 * API route handlers (server-side, authoritative) and by the order-table
 * cell editors (client-side, for instant inline feedback) - one source of
 * truth for "what is a valid order row."
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

const nonNegativeDecimalString = z
  .string()
  .trim()
  .min(1, "Required")
  .refine((v) => !Number.isNaN(Number(v)), "Must be a number")
  .refine((v) => Number(v) >= 0, "Must be zero or greater");

// Base shape kept separate from its cross-field refinements: Zod's
// `.superRefine()` returns a ZodEffects wrapper that no longer exposes
// `.partial()`, so the update schema (which needs every field optional)
// is built from this plain object schema instead of from
// `orderInputSchema` itself.
const optionalDecimalString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => !v || !Number.isNaN(Number(v)), "Must be a number")
  .refine((v) => !v || Number(v) >= 0, "Must be zero or greater");

export const orderObjectSchema = z.object({
  orderDate: isoDate,
  customerId: z.string().min(1, "Select a customer"),
  item: z.string().trim().min(1, "Item is required").max(120),
  pieces: z.coerce
    .number()
    .int("Pieces must be a whole number")
    .min(0, "Pieces must be 0 or greater"),
  weightIn: nonNegativeDecimalString,
  weightOut: nonNegativeDecimalString,
  makingCharge: nonNegativeDecimalString,
  touch: nonNegativeDecimalString,
  weightIn2: optionalDecimalString,
  weightOut2: optionalDecimalString,
  notes: z.string().max(2000).optional().nullable(),
  // User's explicit confirmation that Weight Out > Weight In is intentional
  // (e.g. an additional piece was added during polishing). Section 10.
  weightExceedsConfirmed: z.boolean().optional(),
});

function applyOrderCrossFieldRules(
  data: { weightIn?: string; weightOut?: string; touch?: string; weightExceedsConfirmed?: boolean },
  ctx: z.RefinementCtx,
) {
  if (data.weightIn !== undefined && data.weightOut !== undefined) {
    const weightIn = Number(data.weightIn);
    const weightOut = Number(data.weightOut);
    if (weightOut > weightIn && !data.weightExceedsConfirmed) {
      ctx.addIssue({
        code: "custom",
        path: ["weightOut"],
        message: "Weight Out exceeds Weight In. Confirm this is correct before saving.",
      });
    }
  }
  if (data.touch !== undefined) {
    const touchValue = Number(data.touch);
    if (touchValue > 100) {
      // Not a hard block (business rule may legitimately vary), but flagged
      // for the caller to decide whether to warn (section 10: "optionally
      // prevent unreasonable touch values based on configurable rules").
      ctx.addIssue({
        code: "custom",
        path: ["touch"],
        message: "Touch above 100 is unusual - double check this value.",
        fatal: false,
      });
    }
  }
}

export const orderInputSchema = orderObjectSchema.superRefine(applyOrderCrossFieldRules);

/**
 * Hand-written rather than `z.infer`'d: repository functions (and tests
 * that call them directly, bypassing the API/zod layer) construct these
 * objects without every optional field present. Zod's inferred output type
 * would mark `notes`/`weightExceedsConfirmed` as always-present keys
 * (since every branch of the schema resolves them to a concrete value by
 * the time `.parse()` returns), which is correct for *parsed* API input
 * but stricter than what the repository layer actually requires. A parsed
 * object satisfies this looser shape automatically, so API routes need no
 * extra casting.
 */
export interface OrderInput {
  orderDate: string;
  customerId: string;
  item: string;
  pieces: number;
  weightIn: string;
  weightOut: string;
  makingCharge: string;
  touch: string;
  weightIn2?: string | null;
  weightOut2?: string | null;
  notes?: string | null;
  weightExceedsConfirmed?: boolean;
}

export const orderUpdateSchema = orderObjectSchema
  .partial()
  .extend({ id: z.string().min(1) })
  .superRefine(applyOrderCrossFieldRules);

export const orderFilterSchema = z.object({
  search: z.string().optional(),
  customerId: z.string().optional(),
  item: z.string().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(200),
  sortBy: z
    .enum(["orderDate", "customerName", "item", "pieces", "weightIn", "weightOut", "fineTotal", "createdAt"])
    .default("orderDate"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  includeDeleted: z.coerce.boolean().default(false),
});

export type OrderFilter = z.infer<typeof orderFilterSchema>;
