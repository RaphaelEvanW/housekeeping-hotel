import { z } from "zod";

export const issueBorrowingInputSchema = z
  .object({
    requestId: z.string().uuid(),
    guestVisitId: z.string().uuid(),
    unitIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.unitIds).size !== input.unitIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["unitIds"],
        message: "Unit yang sama tidak boleh dipilih lebih dari sekali.",
      });
    }
  });
