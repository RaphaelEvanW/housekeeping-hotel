import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { receiveReturnInputSchema } from "../../src/server/receive-return-input";

function input() {
  return {
    requestId: randomUUID(),
    guestVisitId: randomUUID(),
    defaultLocationId: randomUUID(),
    lines: [{ borrowingLineId: randomUUID() }],
  };
}

it("defaults each returned unit to GOOD", () => {
  const value = input();
  const parsed = receiveReturnInputSchema.parse(value);

  expect(parsed.lines[0]).toEqual({
    borrowingLineId: value.lines[0].borrowingLineId,
    condition: "GOOD",
  });
});

it("accepts different conditions and per-line receiving locations", () => {
  const value = input();
  const overrideLocationId = randomUUID();

  const parsed = receiveReturnInputSchema.parse({
    ...value,
    lines: [
      value.lines[0],
      {
        borrowingLineId: randomUUID(),
        condition: "DAMAGED",
        locationId: overrideLocationId,
      },
    ],
  });

  expect(parsed.lines[1]).toMatchObject({
    condition: "DAMAGED",
    locationId: overrideLocationId,
  });
});

it("rejects repeated borrowing lines", () => {
  const value = input();

  expect(
    receiveReturnInputSchema.safeParse({
      ...value,
      lines: [value.lines[0], value.lines[0]],
    }).success,
  ).toBe(false);
});

it.each([
  { lines: [] },
  {
    lines: Array.from({ length: 101 }, () => ({
      borrowingLineId: randomUUID(),
    })),
  },
  { requestId: "invalid" },
  { guestVisitId: "invalid" },
  { defaultLocationId: "invalid" },
  { receivedById: randomUUID() },
  { receivedAt: "2026-10-27T00:00:00Z" },
  { lines: [{ borrowingLineId: "invalid" }] },
  {
    lines: [
      {
        borrowingLineId: randomUUID(),
        locationId: "invalid",
      },
    ],
  },
  {
    lines: [
      {
        borrowingLineId: randomUUID(),
        condition: "LOST",
      },
    ],
  },
  {
    lines: [
      {
        borrowingLineId: randomUUID(),
        unitId: randomUUID(),
      },
    ],
  },
])("rejects invalid or client-controlled fields: %j", (patch) => {
  expect(
    receiveReturnInputSchema.safeParse({
      ...input(),
      ...patch,
    }).success,
  ).toBe(false);
});
