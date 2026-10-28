import { expect, it } from "vitest";

import {
  confirmedUnitReceipt,
  maintenanceHandoverId,
  parseUnitMaintenance,
  type UnitReceiptPayload,
} from "../../src/lib/unit-maintenance-view";

const unitId = "22222222-2222-4222-8222-222222222222";
const handoverId = "11111111-1111-4111-8111-111111111111";
const receiptId = "44444444-4444-4444-8444-444444444444";
const handoverPhotoId = "33333333-3333-4333-8333-333333333333";
const receiptPhotoId = "55555555-5555-4555-8555-555555555555";

const payload: UnitReceiptPayload = {
  requestId: receiptId,
  handoverId,
  expectedUpdatedAt: "2026-10-28T01:00:00.000Z",
  occurredAt: "2026-10-28T03:00:00.000Z",
  locationId: "66666666-6666-4666-8666-666666666666",
  condition: "DAMAGED",
  receivedFrom: "Petugas Engineering",
  workPerformed: "Unit diterima, kerusakan masih perlu penanganan.",
  performedBy: null,
  workCompletedAt: null,
};

function handover() {
  return {
    id: handoverId,
    unitId,
    action: "ITEM_UNIT_SENT_TO_ENGINEERING",
    notes: "Unit mati saat diperiksa.",
    after: {
      handoverId,
      occurredAt: "2026-10-28T02:00:00.000Z",
      handedOverTo: "Petugas Engineering",
      condition: "DAMAGED",
      custody: "ENGINEERING",
      readiness: "ON_HOLD",
      locationId: null,
    },
    recordedAt: "2026-10-28T02:01:00.000Z",
    recordedBy: { id: unitId, name: "Petugas" },
    photos: [
      {
        id: handoverPhotoId,
        url: `/api/item-units/${unitId}/photos/${handoverPhotoId}`,
      },
    ],
  };
}

function receipt() {
  return {
    id: receiptId,
    unitId,
    action: "ITEM_UNIT_RECEIVED_FROM_ENGINEERING",
    notes: payload.workPerformed,
    newValues: { handoverId },
    after: {
      handoverId,
      occurredAt: payload.occurredAt,
      receivedFrom: payload.receivedFrom,
      performedBy: payload.performedBy,
      workCompletedAt: payload.workCompletedAt,
      workPerformed: payload.workPerformed,
      condition: payload.condition,
      custody: "HOUSEKEEPING",
      readiness: "PENDING_VERIFICATION",
      locationId: payload.locationId,
    },
    recordedAt: "2026-10-28T03:01:00.000Z",
    recordedBy: { id: unitId, name: "Petugas" },
    photos: [
      {
        id: receiptPhotoId,
        url: `/api/item-units/${unitId}/photos/${receiptPhotoId}`,
      },
    ],
  };
}

function pair(after: ReturnType<typeof receipt> | null = null) {
  return { handoverId, unitId, before: handover(), after };
}

it("parses an open or received handover only when its linked evidence is valid", () => {
  expect(parseUnitMaintenance(pair(), handoverId, unitId)?.after).toBeNull();
  expect(parseUnitMaintenance(pair(receipt()), handoverId, unitId)?.after?.id).toBe(receiptId);
  expect(parseUnitMaintenance(pair(receipt()), receiptId, unitId)).toBeNull();
  expect(
    parseUnitMaintenance(
      { ...pair(receipt()), after: { ...receipt(), after: { ...receipt().after, handoverId: receiptId } } },
      handoverId,
      unitId,
    ),
  ).toBeNull();
  expect(
    parseUnitMaintenance(
      { ...pair(receipt()), after: { ...receipt(), photos: handover().photos } },
      handoverId,
      unitId,
    ),
  ).toBeNull();
});

it("confirms receipt state and evidence without requiring repair details for unchanged condition", () => {
  const response = { handoverId, replayed: false, event: receipt() };
  expect(confirmedUnitReceipt(response, payload, unitId, 1)).toBe(true);
  expect(
    confirmedUnitReceipt({ ...response, replayed: true }, payload, unitId, 1),
  ).toBe(true);
  expect(confirmedUnitReceipt(response, payload, unitId, 0)).toBe(false);
  expect(
    confirmedUnitReceipt(
      { ...response, event: { ...receipt(), after: { ...receipt().after, readiness: "CLEAR" } } },
      payload,
      unitId,
      1,
    ),
  ).toBe(false);
});

it("finds the handover for both handover and receipt activities", () => {
  expect(maintenanceHandoverId(handover())).toBe(handoverId);
  expect(maintenanceHandoverId(receipt())).toBe(handoverId);
  expect(maintenanceHandoverId({ ...receipt(), newValues: { handoverId } })).toBe(handoverId);
  expect(maintenanceHandoverId({ ...receipt(), newValues: {} })).toBeNull();
});
