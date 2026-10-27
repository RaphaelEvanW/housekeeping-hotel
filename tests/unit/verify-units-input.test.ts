import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import { verifyUnitsInputSchema } from "../../src/server/verify-units-input";

function input() {
  return {
    requestId: randomUUID(),
    units: [
      {
        unitId: randomUUID(),
        expectedUpdatedAt: "2026-10-27T00:00:00.000Z",
        result: "FIT_FOR_USE",
        notes: "  Sudah diperiksa dan layak digunakan.  ",
      },
    ],
  };
}

it("requires per-unit results, notes and a data version", () => {
  expect(verifyUnitsInputSchema.parse(input()).units[0]).toMatchObject({
    result: "FIT_FOR_USE",
    notes: "Sudah diperiksa dan layak digunakan.",
  });
});

it.each([
  { unitId: "invalid" },
  { expectedUpdatedAt: "invalid" },
  { result: "READY" },
  { notes: "" },
  { notes: "   " },
  { notes: "x".repeat(2001) },
  { custody: "HOUSEKEEPING" },
  { readiness: "CLEAR" },
  { condition: "GOOD" },
  { verifiedById: randomUUID() },
])("rejects invalid or server-controlled fields: %j", (patch) => {
  const body = input();

  expect(
    verifyUnitsInputSchema.safeParse({
      ...body,
      units: [{ ...body.units[0], ...patch }],
    }).success,
  ).toBe(false);
});

it("rejects empty batches, invalid request IDs and duplicate units", () => {
  const body = input();

  expect(
    verifyUnitsInputSchema.safeParse({ ...body, units: [] }).success,
  ).toBe(false);
  expect(
    verifyUnitsInputSchema.safeParse({ ...body, requestId: "invalid" }).success,
  ).toBe(false);
  expect(
    verifyUnitsInputSchema.safeParse({
      ...body,
      units: [body.units[0], body.units[0]],
    }).success,
  ).toBe(false);
});

it("rejects batches above 100 units", () => {
  const body = input();

  expect(
    verifyUnitsInputSchema.safeParse({
      ...body,
      units: Array.from({ length: 101 }, () => ({
        ...body.units[0],
        unitId: randomUUID(),
      })),
    }).success,
  ).toBe(false);
});
