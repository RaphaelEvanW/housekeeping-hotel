import { expect, it } from "vitest";
import { confirmedReturn, parseOutstandingBorrowings, prepareReturnUpload, type ReturnPayload } from "../../src/lib/return-upload";
import { prepareUnitPhotoUpload } from "../../src/lib/stock-upload";

const requestId = "22222222-2222-4222-8222-222222222222";
const guestVisitId = "33333333-3333-4333-8333-333333333333";
const locationId = "44444444-4444-4444-8444-444444444444";
const otherLocationId = "55555555-5555-4555-8555-555555555555";
const lineIds = ["66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777"];
const receivedAt = "2026-10-27T01:00:00.000Z";

function payload(): ReturnPayload {
  return { requestId, guestVisitId, defaultLocationId: locationId, lines: [
    { borrowingLineId: lineIds[0], condition: "GOOD" },
    { borrowingLineId: lineIds[1], condition: "DAMAGED", locationId: otherLocationId },
  ] };
}

function receipt() {
  const data = payload();
  return { replayed: false, receipt: { id: requestId, guestVisitId, defaultLocationId: locationId, receivedAt,
    lines: data.lines.map(line => ({ ...line, locationId: line.locationId ?? locationId })),
  } };
}

it("keeps optional GOOD photos, line indexes and evidence intact on retries", async () => {
  const photos = [[], [new File(["evidence"], "return.png", { type: "image/png" })]];
  for (let retry = 0; retry < 2; retry++) {
    const upload = await prepareReturnUpload(payload(), photos);
    const form = await new Response(upload.body, { headers: { "Content-Type": upload.contentType } }).formData();
    expect(JSON.parse(String(form.get("data")))).toEqual(payload());
    expect(form.getAll("photo-0")).toHaveLength(0);
    expect(await (form.get("photo-1") as File).text()).toBe("evidence");
  }
});

it("allows all-GOOD returns without photos but keeps stock uploads mandatory", async () => {
  const data = payload();
  data.lines = data.lines.map(line => ({ ...line, condition: "GOOD" as const }));
  await expect(prepareReturnUpload(data, [[], []])).resolves.toHaveProperty("contentType");
  await expect(prepareUnitPhotoUpload({}, [[], []])).rejects.toThrow();
});

it("rejects missing non-GOOD evidence, invalid images and duplicate selections", async () => {
  await expect(prepareReturnUpload(payload(), [[], []])).rejects.toThrow();
  await expect(prepareReturnUpload(payload(), [[]])).rejects.toThrow();
  await expect(prepareReturnUpload(payload(), [[], [new File(["text"], "notes.txt", { type: "text/plain" })]])).rejects.toThrow();
  const data = payload();
  data.lines = [data.lines[0], data.lines[0]];
  await expect(prepareReturnUpload(data, [[], []])).rejects.toThrow();
});

it("confirms only the exact return request, visit, lines, condition and actual location", () => {
  const saved = receipt();
  expect(confirmedReturn(saved, payload())).toBe(true);
  expect(confirmedReturn({ ...saved, replayed: true }, payload())).toBe(true);
  expect(confirmedReturn({ ...saved, receipt: { ...saved.receipt, lines: [...saved.receipt.lines].reverse() } }, payload())).toBe(true);
  expect(confirmedReturn({ ...saved, receipt: { ...saved.receipt, guestVisitId: requestId } }, payload())).toBe(false);
  expect(confirmedReturn({ ...saved, receipt: { ...saved.receipt, lines: [saved.receipt.lines[0], saved.receipt.lines[0]] } }, payload())).toBe(false);
  expect(confirmedReturn({ ...saved, receipt: { ...saved.receipt, lines: saved.receipt.lines.map(line => ({ ...line, condition: "GOOD" })) } }, payload())).toBe(false);
  expect(confirmedReturn({ ...saved, receipt: { ...saved.receipt, lines: saved.receipt.lines.map(line => ({ ...line, locationId })) } }, payload())).toBe(false);
  expect(confirmedReturn(null, payload())).toBe(false);
});

it("accepts only the requested visit and page of outstanding borrowing choices", () => {
  const page = { visit: { id: guestVisitId }, lines: [{ id: lineIds[0], status: "OUTSTANDING",
    unit: { id: requestId, name: "Unit test", serialNumber: null, unitCode: "HK-000001", item: { name: "Item test" }, condition: "GOOD", custody: "GUEST", lossState: "NONE" },
    borrowing: { issuedAt: receivedAt, issuedBy: { name: "Staff test" } },
  }], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasNextPage: false } };
  expect(parseOutstandingBorrowings(page, guestVisitId, 1)).not.toBeNull();
  const damaged = { ...page, lines: [{ ...page.lines[0], unit: { ...page.lines[0].unit, condition: "DAMAGED" } }] };
  expect(parseOutstandingBorrowings(damaged, guestVisitId, 1)?.lines[0].unit.condition).toBe("DAMAGED");
  expect(parseOutstandingBorrowings({ ...page, lines: [{ ...page.lines[0], unit: { ...page.lines[0].unit, condition: "UNKNOWN" } }] }, guestVisitId, 1)).toBeNull();
  expect(parseOutstandingBorrowings(page, requestId, 1)).toBeNull();
  expect(parseOutstandingBorrowings(page, guestVisitId, 2)).toBeNull();
  expect(parseOutstandingBorrowings({ ...page, lines: [{ ...page.lines[0], status: "RETURNED" }] }, guestVisitId, 1)).toBeNull();
  expect(parseOutstandingBorrowings({ ...page, lines: [page.lines[0], page.lines[0]] }, guestVisitId, 1)).toBeNull();
});
