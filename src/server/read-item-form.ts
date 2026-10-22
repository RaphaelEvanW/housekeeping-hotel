import "server-only";

import { PayloadTooLargeError } from "./read-json-body";

// Includes multipart framing; the decoded file has a separate 2 MiB limit.
const MAX_FORM_BYTES = 2 * 1024 * 1024 + 64 * 1024;

export async function readItemForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing form body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FORM_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}
