import { z } from "zod";

export const listItemsInputSchema = z.object({
  page: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .default("1")
    .transform(Number)
    .pipe(z.number().int().min(1).max(1000)),

  pageSize: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .default("20")
    .transform(Number)
    .pipe(z.number().int().min(1).max(50)),

  q: z
    .string()
    .trim()
    .max(100)
    .default("")
    .transform((value) => value.replace(/\s+/gu, " ").toLowerCase()),
});

export type ListItemsInput = z.infer<typeof listItemsInputSchema>;