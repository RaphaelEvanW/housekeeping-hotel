import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { issueBorrowingInputSchema } from "../../src/server/issue-borrowing-input";

function input() {
  return {
    requestId: randomUUID(),
    guestVisitId: randomUUID(),
    unitIds: [randomUUID()],
  };
}

it("accepts exact unit selection", () => {
  const value = input();
  expect(issueBorrowingInputSchema.parse(value)).toEqual(value);
});

it("rejects duplicate units", () => {
  const value = input();
  value.unitIds.push(value.unitIds[0]);
  expect(issueBorrowingInputSchema.safeParse(value).success).toBe(false);
});

it.each([
  { unitIds: [] },
  { unitIds: Array.from({ length: 101 }, () => randomUUID()) },
  { guestVisitId: "invalid" },
  { requestId: "invalid" },
  { unitIds: ["invalid"] },
  { issuedById: randomUUID() },
  { issuedAt: "2026-10-26T00:00:00Z" },
])("rejects invalid or client-controlled fields: %j", (patch) => {
  expect(
    issueBorrowingInputSchema.safeParse({ ...input(), ...patch }).success,
  ).toBe(false);
});
