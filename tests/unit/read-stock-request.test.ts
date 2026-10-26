import { expect, it } from "vitest";
import { readStockRequest } from "../../src/server/read-stock-request";
import { readItemForm } from "../../src/server/read-item-form";
import { PayloadTooLargeError } from "../../src/server/read-json-body";

const input = {
  requestId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0",
  itemId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0", quantity: 2,
};
function request(form: FormData) {
  return new Request("http://localhost/stock", { method: "POST", body: form });
}
function form() {
  const data = new FormData(); data.set("data", JSON.stringify(input)); return data;
}

it("groups repeated photo fields by exact unit index", async () => {
  const data = form();
  data.append("photo-1", new File(["b"], "b.png"));
  data.append("photo-0", new File(["a"], "a.png"));
  data.append("photo-0", new File(["c"], "c.png"));
  const result = await readStockRequest(request(data));
  expect(result.photos.map(files => files.map(file => file.name))).toEqual([["a.png", "c.png"], ["b.png"]]);
});

it.each(["photo-2", "photo--1", "photo-00", "photoKey"])("rejects invalid field/index %s", async key => {
  const data = form(); data.append(key, new File(["a"], "a.png"));
  await expect(readStockRequest(request(data))).rejects.toBeInstanceOf(SyntaxError);
});

it("rejects non-file photo fields and duplicate metadata", async () => {
  const nonFile = form(); nonFile.append("photo-0", "file-path.webp");
  await expect(readStockRequest(request(nonFile))).rejects.toBeInstanceOf(SyntaxError);
  const duplicate = form(); duplicate.append("data", JSON.stringify(input));
  await expect(readStockRequest(request(duplicate))).rejects.toBeInstanceOf(SyntaxError);
});

it("keeps JSON readable for legacy replay without inventing photos", async () => {
  const result = await readStockRequest(new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
  expect(result).toEqual({ body: input, photos: [] });
});

it("enforces an explicit multipart stream limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(65)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: stream, duplex: "half",
  } as RequestInit);
  await expect(readItemForm(req, 64)).rejects.toBeInstanceOf(PayloadTooLargeError);
  expect(cancelled).toBe(true);
});

it("rejects oversized metadata before accepting photo fields", async () => {
  const data = form();
  data.set("data", JSON.stringify({ ...input, extra: "x".repeat(256 * 1024) }));
  await expect(readStockRequest(request(data))).rejects.toBeInstanceOf(PayloadTooLargeError);
});

it("bounds the stock request stream even without a content-length", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: stream, duplex: "half",
  } as RequestInit);
  await expect(readStockRequest(req)).rejects.toBeInstanceOf(PayloadTooLargeError);
  expect(cancelled).toBe(true);
});

it("accepts a multipart body above the catalog limit but within the stock limit", async () => {
  const data = form();
  data.append("photo-0", new File([new Uint8Array(3 * 1024 * 1024)], "large.png"));
  const result = await readStockRequest(request(data));
  expect(result.photos[0][0].size).toBe(3 * 1024 * 1024);
});

it("rejects a missing multipart body or boundary", async () => {
  const empty = new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
  });
  await expect(readStockRequest(empty)).rejects.toBeInstanceOf(SyntaxError);
  const malformed = new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "multipart/form-data" }, body: "broken",
  });
  await expect(readStockRequest(malformed)).rejects.toBeInstanceOf(TypeError);
});
