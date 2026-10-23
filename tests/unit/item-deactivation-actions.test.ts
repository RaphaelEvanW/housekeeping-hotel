import { expect, it } from "vitest";
import { confirmedDeactivationAction, deactivationMutation } from "../../src/lib/item-deactivation-actions";

const requestId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const actorId = "supervisor";

it.each([
  ["APPROVE", "decision", { decision: "APPROVE" }],
  ["REJECT", "decision", { decision: "REJECT" }],
  ["CANCEL", "cancel", {}],
] as const)("uses the existing endpoint/body for %s", (action, segment, body) => {
  expect(deactivationMutation(action)).toEqual({ segment, body });
});

it.each([
  ["APPROVE", "APPROVED"], ["REJECT", "REJECTED"], ["CANCEL", "CANCELLED"],
] as const)("confirms %s only for the expected actor and request", (action, status) => {
  const request = { id: requestId, itemId, decidedById: actorId, status, decidedAt: "2026-10-23T04:00:00.000Z" };
  const expected = { requestId, itemId, actorId, action };
  expect(confirmedDeactivationAction({ deactivationRequest: request }, expected)).not.toBeNull();
  for (const invalid of [
    { ...request, id: itemId }, { ...request, itemId: requestId },
    { ...request, decidedById: "another-actor" }, { ...request, status: "PENDING" },
    { ...request, decidedAt: "invalid" }, { ...request, decidedAt: null },
  ]) {
    expect(confirmedDeactivationAction({ deactivationRequest: invalid }, expected)).toBeNull();
  }
  expect(confirmedDeactivationAction(null, expected)).toBeNull();
});
