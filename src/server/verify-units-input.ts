import { z } from "zod";

const verificationUnitInputSchema = z
  .object({
    unitId: z.string().uuid(),
    expectedUpdatedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    result: z.enum(["FIT_FOR_USE", "UNFIT_FOR_USE"]),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();

export const verifyUnitsInputSchema = z
  .object({
    requestId: z.string().uuid(),
    units: z.array(verificationUnitInputSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    const selected = new Set<string>();

    input.units.forEach((unit, index) => {
      if (selected.has(unit.unitId)) {
        ctx.addIssue({
          code: "custom",
          path: ["units", index, "unitId"],
          message: "Unit yang sama tidak boleh diverifikasi dua kali.",
        });
      }

      selected.add(unit.unitId);
    });
  });

export type VerifyUnitsInput = z.infer<typeof verifyUnitsInputSchema>;
