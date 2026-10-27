import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import { reportUnitDamageInputSchema } from "../../src/server/report-unit-damage-input";

function input() {
  return {
    requestId: randomUUID(),
    unitId: randomUUID(),
    condition: "DAMAGED",
    notes: "  Kabel rusak setelah diperiksa kembali.  ",
  };
}

it("requires an observed damage condition and trims report notes", () => {
  expect(reportUnitDamageInputSchema.parse(input())).toMatchObject({
    condition: "DAMAGED",
    notes: "Kabel rusak setelah diperiksa kembali.",
  });
});

it.each([
  { requestId: "invalid" },
  { unitId: "invalid" },
  { condition: "GOOD" },
  { condition: "LOST" },
  { condition: "MISSING" },
  { notes: "" },
  { notes: "   " },
  { notes: "x".repeat(2001) },
  { readiness: "CLEAR" },
  { custody: "HOUSEKEEPING" },
  { reportedById: randomUUID() },
  { reportedAt: "2026-10-27T00:00:00Z" },
])("rejects invalid or server-controlled report fields: %j", (patch) => {
  expect(
    reportUnitDamageInputSchema.safeParse({ ...input(), ...patch }).success,
  ).toBe(false);
});
