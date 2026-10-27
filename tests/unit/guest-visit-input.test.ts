import { expect, it } from "vitest";
import {
  checkoutGuestVisitInputSchema,
  registerGuestVisitInputSchema,
  updateGuestVisitInputSchema,
} from "../../src/server/guest-visit-input";

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
  { duplicateOverrideReason: "Tetap buat kunjungan baru." },
  { bookingNumber: "x".repeat(101) },
  { status: "CHECKED_OUT" },
  { createdById: "untrusted" },
  { isDuplicate: true },
])("rejects invalid or server-controlled input %j", (change) => {
  expect(
    registerGuestVisitInputSchema.safeParse({ ...input, ...change }).success,
  ).toBe(false);
});

it("requires explicit confirmation to acknowledge outstanding loans at checkout", () => {
  expect(checkoutGuestVisitInputSchema.parse({})).toEqual({ acknowledgeOutstanding: false });
  expect(checkoutGuestVisitInputSchema.parse({ acknowledgeOutstanding: true })).toEqual({ acknowledgeOutstanding: true });
});

it.each([
  { acknowledgeOutstanding: "true" },
  { acknowledgeOutstanding: null },
  { status: "CHECKED_OUT" },
  { checkedOutAt: "2026-10-27T00:00:00Z" },
  { updatedById: "untrusted" },
])("rejects invalid or server-controlled checkout input %j", (body) => {
  expect(checkoutGuestVisitInputSchema.safeParse(body).success).toBe(false);
});

it("normalizes a correction and accepts the existing FE false acknowledgement", () => {
  expect(updateGuestVisitInputSchema.parse({
    expectedUpdatedAt: "2026-10-27T10:00:00.000Z",
    primaryGuestName: "  Tamu   Utama ",
    roomNumber: "  A-102 ",
    reason: " Koreksi dari kartu registrasi ",
  })).toMatchObject({
    primaryGuestName: "Tamu Utama",
    roomNumber: "A-102",
    reason: "Koreksi dari kartu registrasi",
    acknowledgeDuplicate: false,
  });
});

it.each([
  {},
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", reason: "Koreksi" },
  { expectedUpdatedAt: "not-a-date", primaryGuestName: "Tamu", reason: "Koreksi" },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", primaryGuestName: " ", reason: "Koreksi" },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", roomNumber: " ", reason: "Koreksi" },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", primaryGuestName: "Tamu", reason: " " },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", primaryGuestName: "Tamu", reason: "Koreksi", status: "CHECKED_OUT" },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", roomNumber: "A-102", reason: "Koreksi", updatedById: "untrusted" },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", roomNumber: "A-102", reason: "Koreksi", acknowledgeDuplicate: "true" },
  { expectedUpdatedAt: "2026-10-27T10:00:00.000Z", roomNumber: "A-102", reason: "Koreksi", acknowledgeDuplicate: true },
])("rejects invalid or server-controlled guest visit correction %j", (body) => {
  expect(updateGuestVisitInputSchema.safeParse(body).success).toBe(false);
});
