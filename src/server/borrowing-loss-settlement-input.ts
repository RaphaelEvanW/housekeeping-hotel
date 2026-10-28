import { z } from "zod";
import { unitNameSchema } from "@/server/item-unit-input";

export const lossSettlementIdSchema = z.string().uuid();

export const proposeCompensationInputSchema = z
  .object({
    requestId: z.string().uuid(),
    amount: z
      .string()
      .trim()
      .regex(
        /^(?=.*[1-9])(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/u,
        "Masukkan nominal positif dengan maksimal 4 angka desimal.",
      ),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/u, "Kode mata uang harus terdiri dari 3 huruf."),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();

export const decideSettlementInputSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["APPROVE", "REJECT"]),
    notes: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => value || null),
  })
  .strict();

export const proposeWriteOffInputSchema = z
  .object({
    requestId: z.string().uuid(),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();

export const decideWriteOffInputSchema = decideSettlementInputSchema.extend({
  notes: z.string().trim().min(1).max(2000),
});

export const proposeReplacementInputSchema = z
  .object({
    requestId: z.string().uuid(),
    replacementItemId: z.string().uuid(),
    name: unitNameSchema,
    serialNumber: z.string().trim().max(200).nullable().optional()
      .transform((value) => value || null),
    condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]).default("GOOD"),
    receivedAt: z.string().datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    receiptConfirmed: z.literal(true),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();
