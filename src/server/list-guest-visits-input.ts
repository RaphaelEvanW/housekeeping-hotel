import { z } from "zod";
export const listGuestVisitsInputSchema = z.object({
  page: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .default("1")
    .transform(Number)
    .pipe(z.number().int().min(1).max(1000)),
  pageSize: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .default("10")
    .transform(Number)
    .pipe(z.number().int().min(1).max(50)),
  q: z
    .string()
    .trim()
    .max(200)
    .default("")
    .transform((value) => value.replace(/\s+/gu, " ").toLowerCase()),
  status: z.enum(["STAYING", "CHECKED_OUT", "ALL"]).default("STAYING"),
});
