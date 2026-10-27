import { expect, it } from "vitest";
import {
  confirmedDamageReport,
  type DamageReportPayload,
} from "../../src/lib/unit-damage-report";

const requestId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const photoId = "33333333-3333-4333-8333-333333333333";
const actorId = "44444444-4444-4444-8444-444444444444";
const photo = {
  id: photoId,
  url: `/api/item-units/${unitId}/photos/${photoId}`,
};

const payload: DamageReportPayload = {
  requestId,
  unitId,
  condition: "DAMAGED",
  notes: "Pegangan retak.",
};

function response() {
  return {
    replayed: false,
    report: {
      id: requestId,
      unitId,
      notes: payload.notes,
      reportedAt: "2026-10-27T03:00:00.000Z",
      reportedBy: { id: actorId, name: "Petugas" },
      photos: [photo],
    },
  };
}

it("confirms a saved report and replay, including optional photos", () => {
  const saved = response();

  expect(confirmedDamageReport(saved, payload, 1)).toBe(true);
  expect(
    confirmedDamageReport({ ...saved, replayed: true }, payload, 1),
  ).toBe(true);
  expect(
    confirmedDamageReport(
      { ...saved, report: { ...saved.report, photos: [] } },
      payload,
      0,
    ),
  ).toBe(true);
});

it("rejects a mismatched report, unit, notes, or photo evidence", () => {
  const saved = response();

  for (const report of [
    { ...saved.report, id: actorId },
    { ...saved.report, unitId: actorId },
    { ...saved.report, notes: "Catatan lain." },
    { ...saved.report, photos: [] },
    {
      ...saved.report,
      photos: [
        {
          id: photoId,
          url: `/api/item-units/${actorId}/photos/${photoId}`,
        },
      ],
    },
    { ...saved.report, photos: [photo, photo] },
  ]) {
    expect(confirmedDamageReport({ ...saved, report }, payload, 1)).toBe(false);
  }

  expect(confirmedDamageReport(null, payload, 1)).toBe(false);
});
