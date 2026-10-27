import { z } from "zod";
import type { VerifyUnitsInput } from "@/server/verify-units-input";

export type VerificationPayload = VerifyUnitsInput;

const verificationUnitSchema = z.object({
  id: z.string().uuid(),
  unitNumber: z.number().int().positive().max(2_147_483_647),
  unitCode: z.string().min(1),
  name: z.string().nullable(),
  serialNumber: z.string().nullable(),
  condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
  lifecycle: z.enum(["ACTIVE", "RETIRED"]),
  custody: z.enum(["HOUSEKEEPING", "GUEST", "ENGINEERING", "EXTERNAL_VENDOR"]),
  readiness: z.enum(["CLEAR", "ON_HOLD", "PENDING_INSPECTION", "PENDING_VERIFICATION"]),
  lossState: z.enum(["NONE", "MISSING", "LOST"]),
  updatedAt: z.iso.datetime({ offset: true }),
  location: z.object({ name: z.string() }).nullable(),
});

const unitsPageSchema = z.object({
  item: z.object({ id: z.string().uuid(), name: z.string() }),
  units: z.array(verificationUnitSchema).max(50),
  nextCursor: z.number().int().positive().max(2_147_483_647).nullable(),
});

const responseSchema = z.object({
  verification: z.object({
    id: z.string().uuid(),
    verifiedAt: z.iso.datetime({ offset: true }),
    verifiedBy: z.object({ id: z.string().uuid(), name: z.string() }),
    units: z.array(z.object({
      eventId: z.string().uuid(),
      unitId: z.string().uuid(),
      result: z.enum(["FIT_FOR_USE", "UNFIT_FOR_USE"]),
      condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
      readiness: z.enum(["CLEAR", "ON_HOLD"]),
      notes: z.string(),
      photos: z.array(z.object({ id: z.string().uuid(), url: z.string() })).min(1),
    })).min(1).max(100),
  }),
  replayed: z.boolean(),
});

export type VerificationUnit = z.infer<typeof verificationUnitSchema>;

export function canVerifyUnit(unit: VerificationUnit) {
  return unit.lifecycle === "ACTIVE" && unit.custody !== "GUEST" && unit.lossState === "NONE" && unit.readiness !== "CLEAR";
}

export function parseVerificationUnits(body: unknown, itemId: string, after?: number) {
  const parsed = unitsPageSchema.safeParse(body);
  if (!parsed.success || parsed.data.item.id !== itemId) return null;

  const ids = new Set<string>();
  let previous = after ?? 0;
  for (const unit of parsed.data.units) {
    if (ids.has(unit.id) || unit.unitNumber <= previous) return null;
    ids.add(unit.id);
    previous = unit.unitNumber;
  }

  const last = parsed.data.units.at(-1)?.unitNumber;
  if (parsed.data.nextCursor !== null && parsed.data.nextCursor !== last) return null;
  return parsed.data;
}

export function confirmedUnitVerification(
  body: unknown,
  payload: VerificationPayload,
  photos: File[][],
  conditions: ReadonlyMap<string, VerificationUnit["condition"]>,
) {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success || photos.length !== payload.units.length) return null;
  const saved = parsed.data.verification;
  if (saved.id !== payload.requestId || saved.units.length !== payload.units.length) return null;

  const inputIds = new Set(payload.units.map((unit) => unit.unitId));
  const savedById = new Map<string, (typeof saved.units)[number]>(
    saved.units.map((unit) => [unit.unitId, unit] as const),
  );
  const eventIds = new Set(saved.units.map((unit) => unit.eventId));
  const photoIds = new Set(saved.units.flatMap((unit) => unit.photos.map((photo) => photo.id)));
  if (
    inputIds.size !== payload.units.length ||
    savedById.size !== payload.units.length ||
    saved.units.some((unit) => !inputIds.has(unit.unitId)) ||
    eventIds.size !== saved.units.length ||
    photoIds.size !== saved.units.reduce((count, unit) => count + unit.photos.length, 0)
  ) return null;

  for (let index = 0; index < payload.units.length; index += 1) {
    const input = payload.units[index];
    const result = savedById.get(input.unitId);
    const files = photos[index];
    if (!result || !files || result.result !== input.result || result.notes !== input.notes) return null;
    if (result.condition !== conditions.get(input.unitId)) return null;
    if (result.readiness !== (input.result === "FIT_FOR_USE" ? "CLEAR" : "ON_HOLD")) return null;
    if (result.photos.length !== files.length) return null;
    if (result.photos.some((photo) => photo.url !== `/api/item-units/${input.unitId}/photos/${photo.id}`)) return null;
  }

  return parsed.data;
}
