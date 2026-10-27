import { z } from "zod";

const returnLineInputSchema = z
  .object({
    borrowingLineId: z.string().uuid(),
    condition: z
      .enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"])
      .default("GOOD"),
    locationId: z.string().uuid().optional(),
  })
  .strict();

export const receiveReturnInputSchema = z
  .object({
    requestId: z.string().uuid(),
    guestVisitId: z.string().uuid(),
    defaultLocationId: z.string().uuid(),
    lines: z.array(returnLineInputSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    const selected = new Set<string>();

    input.lines.forEach((line, index) => {
      if (selected.has(line.borrowingLineId)) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "borrowingLineId"],
          message: "Pinjaman unit yang sama tidak boleh dipilih dua kali.",
        });
      }

      selected.add(line.borrowingLineId);
    });
  });
