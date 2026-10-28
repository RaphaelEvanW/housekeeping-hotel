import { z } from "zod";
import type { HandoverUnitInput } from "@/server/unit-maintenance-input";

export type UnitHandoverPayload = HandoverUnitInput;

export const handoverResponseSchema = z.object({
  handoverId: z.uuid(),
  replayed: z.boolean(),
  event: z.object({
    id: z.uuid(),
    unitId: z.uuid(),
    action: z.literal("ITEM_UNIT_SENT_TO_ENGINEERING"),
    notes: z.string(),
    after: z.object({
      handoverId: z.uuid(),
      occurredAt: z.iso.datetime({ offset: true }),
      handedOverTo: z.string(),
      condition: z.enum(["MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
      custody: z.literal("ENGINEERING"),
      readiness: z.literal("ON_HOLD"),
      locationId: z.null(),
    }),
    photos: z.array(
      z.object({
        id: z.uuid(),
        url: z.string(),
      }),
    ).min(1),
  }),
});

export function confirmedUnitHandover(
  body: unknown,
  payload: UnitHandoverPayload,
  photoCount: number,
) {
  const parsed = handoverResponseSchema.safeParse(body);
  if (!parsed.success || photoCount < 1) return false;

  const { handoverId, event } = parsed.data;

  return (
    handoverId === payload.requestId &&
    event.id === payload.requestId &&
    event.unitId === payload.unitId &&
    event.notes === payload.notes &&
    event.after.handoverId === payload.requestId &&
    event.after.occurredAt === payload.occurredAt &&
    event.after.handedOverTo === payload.handedOverTo &&
    event.after.condition === payload.condition &&
    event.photos.length === photoCount &&
    new Set(event.photos.map((photo) => photo.id)).size === photoCount &&
    event.photos.every(
      (photo) =>
        photo.url === `/api/item-units/${payload.unitId}/photos/${photo.id}`,
    )
  );
}
