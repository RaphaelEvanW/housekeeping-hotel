import "server-only";

export const MAX_JSON_BODY_BYTES = 256 * 1024;

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Ukuran data maksimal 256 KiB.");
    this.name = "PayloadTooLargeError";
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.body) {
    throw new SyntaxError("Body JSON wajib diisi.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_JSON_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();

    return JSON.parse(text) as unknown;
  } finally {
    reader.releaseLock();
  }
}