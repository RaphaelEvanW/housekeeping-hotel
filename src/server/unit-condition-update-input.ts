import { z } from "zod";

import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";

export const unitConditionUpdateInputSchema = reportUnitDamageInputSchema.extend({
  condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
  expectedUpdatedAt: z.string()
    .datetime({ offset: true })
    .transform((value) => new Date(value).toISOString()),
});
