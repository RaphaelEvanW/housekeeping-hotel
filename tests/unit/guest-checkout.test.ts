import { expect, it } from "vitest";
import { confirmedGuestCheckout } from "../../src/lib/guest-checkout";

const visitId = "33333333-3333-4333-8333-333333333333";
const saved = { visit: { id: visitId, status: "CHECKED_OUT", checkedOutAt: "2026-10-27T01:00:00.000Z" }, outstandingLines: 2, alreadyCheckedOut: false };

it("confirms actual checkout even when borrowing obligations remain outstanding", () => {
  expect(confirmedGuestCheckout(saved, visitId)?.outstandingLines).toBe(2);
  expect(confirmedGuestCheckout({ ...saved, alreadyCheckedOut: true }, visitId)?.visit.checkedOutAt).toBe(saved.visit.checkedOutAt);
});

it("rejects unrelated visits, unconfirmed status and missing checkout timestamps", () => {
  expect(confirmedGuestCheckout(saved, "22222222-2222-4222-8222-222222222222")).toBeNull();
  expect(confirmedGuestCheckout({ ...saved, visit: { ...saved.visit, status: "STAYING" } }, visitId)).toBeNull();
  expect(confirmedGuestCheckout({ ...saved, visit: { ...saved.visit, checkedOutAt: null } }, visitId)).toBeNull();
  expect(confirmedGuestCheckout(null, visitId)).toBeNull();
});
