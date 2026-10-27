import { describe, expect, it } from "vitest";
import {
  canVerifyUnit,
  confirmedUnitVerification,
  parseVerificationUnits,
  type VerificationPayload,
  type VerificationUnit,
} from "../../src/lib/unit-verification";

const itemId = "11111111-1111-4111-8111-111111111111";
const unitId = "22222222-2222-4222-8222-222222222222";
const secondUnitId = "77777777-7777-4777-8777-777777777777";
const requestId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const secondEventId = "88888888-8888-4888-8888-888888888888";
const photoId = "55555555-5555-4555-8555-555555555555";
const secondPhotoId = "99999999-9999-4999-8999-999999999999";
const actorId = "66666666-6666-4666-8666-666666666666";
const updatedAt = "2026-10-27T03:00:00.000Z";

function unit(overrides: Partial<VerificationUnit> = {}): VerificationUnit {
  return {
    id: unitId,
    unitNumber: 1,
    unitCode: "HK-000001",
    name: null,
    serialNumber: "SN-1",
    condition: "GOOD",
    lifecycle: "ACTIVE",
    custody: "HOUSEKEEPING",
    readiness: "PENDING_VERIFICATION",
    lossState: "NONE",
    updatedAt,
    location: { name: "HK Main Storage" },
    ...overrides,
  };
}

const payload: VerificationPayload = {
  requestId,
  units: [{ unitId, expectedUpdatedAt: updatedAt, result: "FIT_FOR_USE", notes: "Pemeriksaan selesai." }],
};

describe("unit verification UI contract", () => {
  it("rejects malformed, duplicated, wrong-item and inconsistent cursor pages", () => {
    const valid = { item: { id: itemId, name: "Vacuum" }, units: [unit()], nextCursor: 1 };
    expect(parseVerificationUnits(valid, itemId)?.units).toHaveLength(1);
    expect(parseVerificationUnits(valid, actorId)).toBeNull();
    expect(parseVerificationUnits(valid, itemId, 1)).toBeNull();
    expect(parseVerificationUnits({ ...valid, nextCursor: 2 }, itemId)).toBeNull();
    expect(parseVerificationUnits({ ...valid, units: [unit(), unit({ unitNumber: 2 })] }, itemId)).toBeNull();
  });

  it("offers only active, present units outside guest custody that still need verification", () => {
    expect(canVerifyUnit(unit())).toBe(true);
    expect(canVerifyUnit(unit({ lifecycle: "RETIRED" }))).toBe(false);
    expect(canVerifyUnit(unit({ custody: "GUEST" }))).toBe(false);
    expect(canVerifyUnit(unit({ lossState: "MISSING" }))).toBe(false);
    expect(canVerifyUnit(unit({ readiness: "CLEAR" }))).toBe(false);
  });

  it("matches saved result, readiness and photo URL to each requested unit", () => {
    const file = new File(["photo"], "condition.png", { type: "image/png" });
    const secondFile = new File(["second photo"], "condition-2.png", { type: "image/png" });
    const photos = [[file], [secondFile]];
    const batch: VerificationPayload = {
      ...payload,
      units: [
        ...payload.units,
        { unitId: secondUnitId, expectedUpdatedAt: updatedAt, result: "UNFIT_FOR_USE", notes: "Perlu perbaikan." },
      ],
    };
    const response = {
      verification: {
        id: requestId,
        verifiedAt: updatedAt,
        verifiedBy: { id: actorId, name: "Supervisor" },
        units: [
          {
            eventId: secondEventId,
            unitId: secondUnitId,
            result: "UNFIT_FOR_USE",
            condition: "DAMAGED",
            readiness: "ON_HOLD",
            notes: "Perlu perbaikan.",
            photos: [{ id: secondPhotoId, url: `/api/item-units/${secondUnitId}/photos/${secondPhotoId}` }],
          },
          {
            eventId,
            unitId,
            result: "FIT_FOR_USE",
            condition: "GOOD",
            readiness: "CLEAR",
            notes: "Pemeriksaan selesai.",
            photos: [{ id: photoId, url: `/api/item-units/${unitId}/photos/${photoId}` }],
          },
        ],
      },
      replayed: false,
    };
    const conditions = new Map([[unitId, "GOOD" as const], [secondUnitId, "DAMAGED" as const]]);
    expect(confirmedUnitVerification(response, batch, photos, conditions)).not.toBeNull();
    expect(confirmedUnitVerification({ ...response, verification: { ...response.verification, units: response.verification.units.map((saved) => saved.unitId === unitId ? { ...saved, readiness: "ON_HOLD" as const } : saved) } }, batch, photos, conditions)).toBeNull();
    expect(confirmedUnitVerification({ ...response, verification: { ...response.verification, units: response.verification.units.map((saved) => saved.unitId === unitId ? { ...saved, photos: [{ id: photoId, url: "/unrelated" }] } : saved) } }, batch, photos, conditions)).toBeNull();
  });
});
