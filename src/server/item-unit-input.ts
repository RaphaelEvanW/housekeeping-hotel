import { z } from "zod";
import { listItemsInputSchema } from "@/server/list-items-input";

export const unitNameSchema = z.string().trim().max(100).nullable()
  .transform(value => value?.replace(/\s+/gu, " ") || null).optional();

const optionalUnitDetailSchema = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value === "" ? null : value))
  .optional();

export const updateItemUnitInputSchema = z
  .object({
    name: unitNameSchema,
    serialNumber: optionalUnitDetailSchema,
    notes: optionalUnitDetailSchema,
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.serialNumber !== undefined ||
      input.notes !== undefined,
    {
      message: "Isi minimal satu detail unit yang ingin dikoreksi.",
    },
  );

  export const itemUnitHistoryInputSchema = listItemsInputSchema
  .pick({
    page: true,
    pageSize: true,
  })
  .extend({
    unitId: z.string().uuid(),
  });
