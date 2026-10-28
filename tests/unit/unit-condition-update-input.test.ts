import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import { unitConditionUpdateInputSchema } from "../../src/server/unit-condition-update-input";

function input() {
  return {
    requestId: randomUUID(),
    unitId: randomUUID(),
    condition: "GOOD",
    expectedUpdatedAt: "2026-10-28T10:00:00+07:00",
    notes: "  Foto pemeriksaan unit.  ",
  };
}

it("accepts condition evidence with a normalized snapshot and trimmed notes", () => {
  expect(unitConditionUpdateInputSchema.parse(input())).toMatchObject({
    condition: "GOOD",
    expectedUpdatedAt: "2026-10-28T03:00:00.000Z",
    notes: "Foto pemeriksaan unit.",
  });
});

it.each([
  { expectedUpdatedAt: undefined },
  { expectedUpdatedAt: "2026-10-28" },
  { unitId: "invalid" },
  { requestId: "invalid" },
  { condition: "LOST" },
  { condition: "MISSING" },
  { notes: " " },
  { notes: "x".repeat(2001) },
  { readiness: "CLEAR" },
  { custody: "HOUSEKEEPING" },
  { recordedById: randomUUID() },
])("rejects invalid snapshots, conditions or privileged fields: %j", (patch) => {
  expect(unitConditionUpdateInputSchema.safeParse({ ...input(), ...patch }).success).toBe(false);
});
