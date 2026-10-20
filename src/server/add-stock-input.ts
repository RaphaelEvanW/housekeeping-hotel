import { z } from "zod";

import { UnitCondition } from "@/generated/prisma/enums";

const unitDetailsSchema = z.object({
  serialNumber: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  condition: z.enum(UnitCondition).default("GOOD"),
});

export const addStockInputSchema = z
  .object({
    requestId: z.string().uuid(),
    itemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    units: z.array(unitDetailsSchema).max(100).optional(),
  })
  .superRefine((input, context) => {
    if (
      input.units !== undefined &&
      input.units.length !== input.quantity
    ) {
      context.addIssue({
        code: "custom",
        path: ["units"],
        message: "Jumlah detail unit harus sama dengan jumlah stok.",
      });
    }
  });

export type AddStockInput = z.infer<typeof addStockInputSchema>;