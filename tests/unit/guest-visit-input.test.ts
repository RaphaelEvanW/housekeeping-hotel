import { expect, it } from "vitest";
import { registerGuestVisitInputSchema } from "../../src/server/guest-visit-input";

const input = {
  requestId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0",
  primaryGuestName: "  Tamu   Pengujian  ",
  roomNumber: "  A-101 ",
  bookingNumber: " BOOK-001 ",
  checkInDate: "2026-10-26",
  plannedCheckoutDate: "2026-10-28",
};

it("normalizes clerical whitespace and permits same-day stays", () => {
  expect(
    registerGuestVisitInputSchema.parse({
      ...input,
      plannedCheckoutDate: input.checkInDate,
    }),
  ).toMatchObject({
    primaryGuestName: "Tamu Pengujian",
    roomNumber: "A-101",
    bookingNumber: "BOOK-001",
  });
});

it.each([
  { bookingNumber: " " },
  { primaryGuestName: " " },
  { roomNumber: " " },
  { checkInDate: "2026-02-30" },
  { checkInDate: "26/10/2026" },
  { plannedCheckoutDate: "2026-10-25" },
  { requestId: "invalid" },
  { duplicateOverrideReason: " " },
  { bookingNumber: "x".repeat(101) },
  { status: "CHECKED_OUT" },
  { createdById: "untrusted" },
  { isDuplicate: true },
])("rejects invalid or server-controlled input %j", (change) => {
  expect(
    registerGuestVisitInputSchema.safeParse({ ...input, ...change }).success,
  ).toBe(false);
});
