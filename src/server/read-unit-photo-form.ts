import "server-only";

import { readItemForm } from "@/server/read-item-form";
import {
  MAX_JSON_BODY_BYTES,
  PayloadTooLargeError,
} from "@/server/read-json-body";

export const MAX_UNIT_PHOTO_FORM_BYTES = 16 * 1024 * 1024;

export async function readUnitPhotoForm<T>(
  request: Request,
  parse: (raw: unknown) => T,
  unitCount: (body: T) => number,
) {
  if (!request.body) {
    throw new SyntaxError("Body multipart wajib diisi.");
  }

  const form = await readItemForm(request, MAX_UNIT_PHOTO_FORM_BYTES);
  const data = form.getAll("data");

  if (data.length !== 1 || typeof data[0] !== "string") {
    throw new SyntaxError("Field data harus berisi satu JSON string.");
  }

  if (new TextEncoder().encode(data[0]).byteLength > MAX_JSON_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }

  const body = parse(JSON.parse(data[0]));
  const count = unitCount(body);
  const photos: File[][] = Array.from({ length: count }, () => []);

  for (const [key, value] of form.entries()) {
    if (key === "data") continue;

    const match = /^photo-(0|[1-9]\d*)$/u.exec(key);
    const index = match ? Number(match[1]) : -1;

    if (index < 0 || index >= count || !(value instanceof File)) {
      throw new SyntaxError("Field foto atau indeks unit tidak valid.");
    }

    photos[index].push(value);
  }

  return {
    body,
    photos: photos.some(files => files.length > 0) ? photos : [],
  };
}