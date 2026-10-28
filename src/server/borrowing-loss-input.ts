import { z } from "zod";

import { listItemsInputSchema } from "@/server/list-items-input";

export const borrowingLossReportIdSchema = z.string().uuid();

export const reportBorrowingLossInputSchema = z
  .object({
    requestId: z.string().uuid(),
    guestVisitId: z.string().uuid(),
    borrowingLineId: z.string().uuid(),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();

export const decideBorrowingLossInputSchema = z
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

const recoveryTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const recoverBorrowedUnitInputSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedUpdatedAt: recoveryTimestampSchema,
    occurredAt: recoveryTimestampSchema,
    locationId: z.string().uuid(),
    condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();

export const listBorrowingLossReportsInputSchema = listItemsInputSchema
  .extend({
    status: z
      .enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"])
      .default("PENDING"),
  })
  .strict();
