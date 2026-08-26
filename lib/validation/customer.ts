import { z } from "zod";

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(200),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  address: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

/**
 * Hand-written rather than `z.infer`'d, for the same reason as
 * lib/validation/order.ts `OrderInput`: the schema's `.transform()` makes
 * phone/address/notes always-present keys in Zod's *output* type (each
 * resolves to `string | null`), which is correct for parsed API input but
 * stricter than repository callers (including tests that build these
 * objects by hand) actually need.
 */
export interface CustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export const customerUpdateSchema = customerInputSchema.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});
