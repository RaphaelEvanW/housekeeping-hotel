import { expect, it } from "vitest";

import {
  PayloadTooLargeError,
  readJsonBody,
} from "../../src/server/read-json-body";

function jsonRequest(body: string) {
  return new Request("http://localhost:3000/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function streamedRequest(chunks: Uint8Array[]) {
  let index = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) {
        controller.close();
        return;
      }

      controller.enqueue(chunks[index]);
      index += 1;
    },
  });

  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  };

  return new Request("http://localhost:3000/api/items", init);
}

it("accepts JSON at exactly 256 KiB", async () => {
  // Dua byte dipakai oleh tanda kutip pembuka dan penutup JSON.
  const value = "A".repeat(256 * 1024 - 2);

  const result = await readJsonBody(
    jsonRequest(JSON.stringify(value)),
  );

  expect(result).toBe(value);
});

it("rejects JSON one byte above 256 KiB", async () => {
  const value = "A".repeat(256 * 1024 - 1);

  await expect(
    readJsonBody(jsonRequest(JSON.stringify(value))),
  ).rejects.toBeInstanceOf(PayloadTooLargeError);
});

it("counts accumulated bytes across chunks despite a small Content-Length", async () => {
  const encoder = new TextEncoder();

  const request = streamedRequest([
    encoder.encode('"' + "A".repeat(128 * 1024)),
    encoder.encode("A".repeat(128 * 1024) + '"'),
  ]);

  request.headers.set("Content-Length", "1");

  await expect(
    readJsonBody(request),
  ).rejects.toBeInstanceOf(PayloadTooLargeError);
});

it("preserves a UTF-8 character split between chunks", async () => {
  const bytes = new TextEncoder().encode('{"name":"é"}');
  const characterStart = bytes.indexOf(0xc3);

  const request = streamedRequest([
    bytes.slice(0, characterStart + 1),
    bytes.slice(characterStart + 1),
  ]);

  await expect(readJsonBody(request)).resolves.toEqual({
    name: "é",
  });
});

it.each(["", "{"])(
  "rejects empty or malformed JSON: %j",
  async (body) => {
    await expect(
      readJsonBody(jsonRequest(body)),
    ).rejects.toBeInstanceOf(SyntaxError);
  },
);