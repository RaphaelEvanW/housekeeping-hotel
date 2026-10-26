import { expect, it } from "vitest";
import { prepareStockUpload, stockPhotoError } from "../../src/lib/stock-upload";

const data = { requestId: "request-1", itemId: "item-1", quantity: 2, units: [{}, {}] };
const photo = (name: string) => new File([name], name, { type: "image/png" });

it("keeps metadata separate and preserves each unit's files on retry", async () => {
  const attempt = { ...data, photos: [[photo("a.png"), photo("b.png")], [photo("c.png")]] };
  for (let retry = 0; retry < 2; retry++) {
    const upload = await prepareStockUpload(attempt);
    const form = await new Response(upload.body, { headers: { "Content-Type": upload.contentType } }).formData();
    expect(JSON.parse(String(form.get("data")))).toEqual(data);
    expect(form.getAll("photo-0").map(file => (file as File).name)).toEqual(["a.png", "b.png"]);
    expect(await (form.get("photo-1") as File).text()).toBe("c.png");
    expect(form.has("photos")).toBe(false);
  }
});

it("rejects missing, empty, oversized and unsupported photos", async () => {
  expect(stockPhotoError([])).not.toBe("");
  expect(stockPhotoError([new File([], "empty.png", { type: "image/png" })])).not.toBe("");
  expect(stockPhotoError([new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })])).not.toBe("");
  expect(stockPhotoError([new File(["svg"], "a.svg", { type: "image/svg+xml" })])).not.toBe("");
  expect(stockPhotoError([photo("valid.png")])).toBe("");
  await expect(prepareStockUpload({ ...data, photos: [[photo("a.png")], []] })).rejects.toThrow();
  await expect(prepareStockUpload({ ...data, photos: [[photo("a.png")]] })).rejects.toThrow();
});

it("rejects excessive metadata and includes multipart framing in the transport cap", async () => {
  await expect(prepareStockUpload({ ...data, units: [{ notes: "x".repeat(256 * 1024) }, {}], photos: [[photo("a.png")], [photo("b.png")]] })).rejects.toThrow();
  const file = new File([new Uint8Array(2 * 1024 * 1024)], "limit.png", { type: "image/png" });
  const last = new File([new Uint8Array(2 * 1024 * 1024 - 1)], "last.png", { type: "image/png" });
  await expect(prepareStockUpload({ ...data, photos: [Array.from({ length: 4 }, () => file), [file, file, file, last]] })).rejects.toThrow();
});
