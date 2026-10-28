import { z } from "zod";

import { handoverResponseSchema } from "@/lib/unit-handover";
import type { ReceiveMaintainedUnitInput } from "@/server/unit-maintenance-input";

export type UnitReceiptPayload = ReceiveMaintainedUnitInput;

const handoverEventSchema = handoverResponseSchema.shape.event.extend({
  recordedAt: z.iso.datetime({ offset: true }),
  recordedBy: z.object({ id: z.uuid(), name: z.string() }),
});

const receiptEventSchema = handoverEventSchema.extend({
  action: z.literal("ITEM_UNIT_RECEIVED_FROM_ENGINEERING"),
  after: z.object({
    handoverId: z.uuid(),
    occurredAt: z.iso.datetime({ offset: true }),
    receivedFrom: z.string(),
    performedBy: z.string().nullable(),
    workCompletedAt: z.iso.datetime({ offset: true }).nullable(),
    workPerformed: z.string(),
    condition: z.enum(["GOOD", "MINOR_DAMAGE", "DAMAGED", "MISSING_PART"]),
    custody: z.literal("HOUSEKEEPING"),
    readiness: z.literal("PENDING_VERIFICATION"),
    locationId: z.uuid(),
  }),
});

const pairSchema = z.object({
  handoverId: z.uuid(),
  unitId: z.uuid(),
  before: handoverEventSchema,
  after: receiptEventSchema.nullable(),
});

const receiptResponseSchema = z.object({
  handoverId: z.uuid(),
  replayed: z.boolean(),
  event: receiptEventSchema,
});

export type UnitMaintenancePair = z.infer<typeof pairSchema>;

function photosBelongToUnit(
  event: { photos?: { id: string; url: string }[] },
  unitId: string,
) {
  const photos = event.photos ?? [];
  return (
    new Set(photos.map((photo) => photo.id)).size === photos.length &&
    photos.every(
      (photo) =>
        photo.url === `/api/item-units/${unitId}/photos/${photo.id}`,
    )
  );
}

export function maintenanceHandoverId(event: {
  id: string;
  action: string;
  newValues?: unknown;
}) {
  if (event.action === "ITEM_UNIT_SENT_TO_ENGINEERING") {
    return z.uuid().safeParse(event.id).success ? event.id : null;
  }

  if (event.action !== "ITEM_UNIT_RECEIVED_FROM_ENGINEERING") return null;

  const values = z
    .object({ handoverId: z.uuid() })
    .safeParse(event.newValues);
  return values.success ? values.data.handoverId : null;
}

export function parseUnitMaintenance(
  body: unknown,
  handoverId: string,
  unitId: string,
) {
  const parsed = pairSchema.safeParse(body);
  if (!parsed.success) return null;

  const pair = parsed.data;
  if (
    pair.handoverId !== handoverId ||
    pair.unitId !== unitId ||
    pair.before.id !== handoverId ||
    pair.before.unitId !== unitId ||
    pair.before.after.handoverId !== handoverId ||
    !photosBelongToUnit(pair.before, unitId)
  ) {
    return null;
  }

  if (pair.after) {
    const handoverPhotos = new Set(
      (pair.before.photos ?? []).map((photo) => photo.id),
    );
    if (
      pair.after.unitId !== unitId ||
      pair.after.after.handoverId !== handoverId ||
      pair.after.id === handoverId ||
      Date.parse(pair.after.after.occurredAt) <
        Date.parse(pair.before.after.occurredAt) ||
      !photosBelongToUnit(pair.after, unitId) ||
      pair.after.photos.some((photo) => handoverPhotos.has(photo.id))
    ) {
      return null;
    }
  }

  return pair;
}

export function confirmedUnitReceipt(
  body: unknown,
  payload: UnitReceiptPayload,
  unitId: string,
  photoCount: number,
) {
  const parsed = receiptResponseSchema.safeParse(body);
  if (!parsed.success || photoCount < 1) return false;

  const { handoverId, event } = parsed.data;
  return (
    handoverId === payload.handoverId &&
    event.id === payload.requestId &&
    event.unitId === unitId &&
    event.notes === payload.workPerformed &&
    event.after.handoverId === payload.handoverId &&
    event.after.occurredAt === payload.occurredAt &&
    event.after.receivedFrom === payload.receivedFrom &&
    event.after.performedBy === payload.performedBy &&
    event.after.workCompletedAt === payload.workCompletedAt &&
    event.after.workPerformed === payload.workPerformed &&
    event.after.condition === payload.condition &&
    event.after.locationId === payload.locationId &&
    event.photos.length === photoCount &&
    new Set(event.photos.map((photo) => photo.id)).size === photoCount &&
    event.photos.every(
      (photo) =>
        photo.url === `/api/item-units/${unitId}/photos/${photo.id}`,
    )
  );
}
