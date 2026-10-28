import { expect, it } from "vitest";
import {
  confirmedUnitHandover,
  type UnitHandoverPayload,
} from "../../src/lib/unit-handover";

const requestId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";

const payload: UnitHandoverPayload = {
  requestId,
  unitId,
  expectedUpdatedAt: "2026-10-28T01:00:00.000Z",
  occurredAt: "2026-10-28T02:00:00.000Z",
  condition: "DAMAGED",
  handedOverTo: "Petugas Engineering",
  notes: "Unit tidak menyala saat diperiksa.",
};

function response() {
  return {
    handoverId: requestId,
    replayed: false,
    event: {
      id: requestId,
      unitId,
      action: "ITEM_UNIT_SENT_TO_ENGINEERING",
      notes: payload.notes,
      after: {
        handoverId: requestId,
        occurredAt: payload.occurredAt,
        handedOverTo: payload.handedOverTo,
        condition: payload.condition,
        custody: "ENGINEERING",
        readiness: "ON_HOLD",
        locationId: null,
      },
      photos: [
        {
          id: photoId,
          url: `/api/item-units/${unitId}/photos/${photoId}`,
        },
      ],
    },
  };
}

it("confirms the handover and its replay with matching evidence", () => {
  expect(confirmedUnitHandover(response(), payload, 1)).toBe(true);
  expect(
    confirmedUnitHandover({ ...response(), replayed: true }, payload, 1),
  ).toBe(true);
});

it("rejects mismatched handover details or evidence", () => {
  const saved = response();

  const invalidResponses = [
    null,
    { ...saved, handoverId: unitId },
    {
      ...saved,
      event: { ...saved.event, unitId: requestId },
    },
    {
      ...saved,
      event: {
        ...saved.event,
        after: { ...saved.event.after, custody: "HOUSEKEEPING" },
      },
    },
    {
      ...saved,
      event: {
        ...saved.event,
        after: { ...saved.event.after, handedOverTo: "Orang lain" },
      },
    },
    {
      ...saved,
      event: { ...saved.event, photos: [] },
    },
    {
      ...saved,
      event: {
        ...saved.event,
        photos: [saved.event.photos[0], saved.event.photos[0]],
      },
    },
    {
      ...saved,
      event: {
        ...saved.event,
        photos: [
          {
            id: photoId,
            url: `/api/item-units/${requestId}/photos/${photoId}`,
          },
        ],
      },
    },
  ];

  for (const body of invalidResponses) {
    expect(confirmedUnitHandover(body, payload, 1)).toBe(false);
  }

  expect(confirmedUnitHandover(saved, payload, 0)).toBe(false);
});
