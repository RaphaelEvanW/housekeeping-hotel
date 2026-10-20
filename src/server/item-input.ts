import { z } from "zod";

export const itemNameSchema = z
  .string()
  .trim()
  .min(1, "Nama jenis barang wajib diisi.")
  .max(100, "Nama jenis barang maksimal 100 karakter.")
  .transform((name) => name.replace(/\s+/gu, " "));

export const createItemInputSchema = z.object({
  name: itemNameSchema,
});