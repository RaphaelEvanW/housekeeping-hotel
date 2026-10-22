import { expect, it } from "vitest";
import { readItemForm } from "../../src/server/read-item-form";
import { PayloadTooLargeError } from "../../src/server/read-json-body";

it("cancels an oversized multipart byte stream without retaining further chunks", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("http://localhost/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half" } as RequestInit);
  await expect(readItemForm(request)).rejects.toBeInstanceOf(PayloadTooLargeError);
  expect(cancelled).toBe(true);
});
