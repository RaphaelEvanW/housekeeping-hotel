import { z } from "zod";
import { listItemsInputSchema } from "@/server/list-items-input";

export const requestItemDeactivationSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "Alasan penonaktifan wajib diisi.")
      .max(1000, "Alasan maksimal 1000 karakter."),
  })
  .strict();

  export const decideItemDeactivationSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
  })
  .strict();

  export const listItemDeactivationsInputSchema = listItemsInputSchema
  .pick({
    page: true,
    pageSize: true,
  })
  .extend({
    status: z
      .enum([
        "PENDING",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "ALL",
      ])
      .default("PENDING"),

    itemId: z.string().uuid().optional(),
  });