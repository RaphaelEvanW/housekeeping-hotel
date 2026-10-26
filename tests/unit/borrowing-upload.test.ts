import { expect, it } from "vitest";
import { confirmedBorrowing, prepareBorrowingUpload } from "../../src/lib/borrowing-upload";

const requestId = "22222222-2222-4222-8222-222222222222";
const guestVisitId = "33333333-3333-4333-8333-333333333333";
const unitIds = ["44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555"];
const payload = { requestId, guestVisitId, unitIds };
const photo = (name: string) => new File([name], name, { type: "image/png" });

it("preserves unit order, request identity and photo bytes on borrowing retries", async () => {
  const photos = [[photo("first.png"), photo("second.png")], [photo("third.png")]];
  for (let retry = 0; retry < 2; retry++) {
    const upload = await prepareBorrowingUpload(payload, photos);
    const form = await new Response(upload.body, { headers: { "Content-Type": upload.contentType } }).formData();
    expect(JSON.parse(String(form.get("data")))).toEqual(payload);
    expect(form.getAll("photo-0").map(file => (file as File).name)).toEqual(["first.png", "second.png"]);
    expect(await (form.get("photo-1") as File).text()).toBe("third.png");
  }
});

it("rejects duplicated units, missing unit photos and excessive multipart payloads", async () => {
  await expect(prepareBorrowingUpload({ ...payload, unitIds: [unitIds[0], unitIds[0]] }, [[photo("a")], [photo("b")]])).rejects.toThrow();
  await expect(prepareBorrowingUpload(payload, [[photo("a")], []])).rejects.toThrow();
  await expect(prepareBorrowingUpload(payload, [[photo("a")]])).rejects.toThrow();
  const large = new File([new Uint8Array(2 * 1024 * 1024)], "large.png", { type: "image/png" });
  await expect(prepareBorrowingUpload(payload, [[large, large, large, large], [large, large, large, large]])).rejects.toThrow();
});

it("confirms only the same visit, request and exact set of units", () => {
  const result = { borrowing: { id: requestId, guestVisitId, lines: unitIds.map(unitId => ({ unitId })) }, replayed: false };
  expect(confirmedBorrowing(result, payload)).toBe(true);
  expect(confirmedBorrowing({ ...result, replayed: true }, payload)).toBe(true);
  expect(confirmedBorrowing({ borrowing: { ...result.borrowing, guestVisitId: requestId }, replayed: false }, payload)).toBe(false);
  expect(confirmedBorrowing({ borrowing: { ...result.borrowing, lines: [{ unitId: unitIds[0] }, { unitId: unitIds[0] }] }, replayed: false }, payload)).toBe(false);
  expect(confirmedBorrowing(null, payload)).toBe(false);
});
