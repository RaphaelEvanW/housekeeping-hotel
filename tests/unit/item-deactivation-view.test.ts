import { expect, it } from "vitest";

import { confirmedDeactivationRequest } from "../../src/lib/item-deactivation-view";

const itemId = "11111111-1111-4111-8111-111111111111";
const actorId = "operator-1";
const reason = "Jenis barang tidak digunakan lagi.";

function responseBody() {
  return {
    deactivationRequest: {
      id: "22222222-2222-4222-8222-222222222222",
      itemId,
      requestedById: actorId,
      status: "PENDING",
      reason,
    },
  };
}

it("accepts a confirmed pending request for the current item and actor", () => {
  expect(
    confirmedDeactivationRequest(responseBody(), itemId, actorId, reason),
  ).not.toBeNull();
});

it("rejects mismatched item, actor or reason", () => {
  expect(
    confirmedDeactivationRequest(
      responseBody(),
      "33333333-3333-4333-8333-333333333333",
      actorId,
      reason,
    ),
  ).toBeNull();

  expect(
    confirmedDeactivationRequest(
      responseBody(),
      itemId,
      "another-operator",
      reason,
    ),
  ).toBeNull();

  expect(
    confirmedDeactivationRequest(
      responseBody(),
      itemId,
      actorId,
      "Alasan lain.",
    ),
  ).toBeNull();
});

it("rejects malformed responses and a non-pending result", () => {
  expect(
    confirmedDeactivationRequest(null, itemId, actorId, reason),
  ).toBeNull();

  const body = responseBody();
  body.deactivationRequest.status = "APPROVED";

  expect(
    confirmedDeactivationRequest(body, itemId, actorId, reason),
  ).toBeNull();
});
