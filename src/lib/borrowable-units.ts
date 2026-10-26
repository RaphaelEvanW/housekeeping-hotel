import { z } from "zod";

const unitSchema = z.object({
  id: z.uuid(), unitNumber: z.number().int().positive(), unitCode: z.string().min(1),
  name: z.string().nullable(), serialNumber: z.string().nullable(),
  condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
  location: z.object({ name: z.string() }),
});
const pageSchema = z.object({
  item: z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }),
  units: z.array(unitSchema).max(50), nextCursor: z.number().int().positive().nullable(),
});

export type BorrowableUnit = z.infer<typeof unitSchema>;
export type SelectedBorrowingUnit = BorrowableUnit & { itemName: string };

export function parseBorrowableUnits(body: unknown, itemId: string, after?: number) {
  const parsed = pageSchema.safeParse(body);
  if (!parsed.success) return null;
  const data = parsed.data;
  if (data.item.id !== itemId || new Set(data.units.map(unit => unit.id)).size !== data.units.length ||
      data.units.some((unit, index) => unit.unitNumber <= (index === 0 ? after ?? 0 : data.units[index - 1].unitNumber)) ||
      (data.nextCursor !== null && data.nextCursor !== data.units.at(-1)?.unitNumber)) return null;
  return data;
}
