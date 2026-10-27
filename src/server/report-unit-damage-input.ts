import { z } from "zod";

export const reportUnitDamageInputSchema = z
  .object({
    requestId: z.string().uuid(),
    unitId: z.string().uuid(),
    condition: z.enum(["MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
    notes: z.string().trim().min(1).max(2000),
  })
  .strict();
