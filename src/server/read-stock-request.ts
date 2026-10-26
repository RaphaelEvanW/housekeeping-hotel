import "server-only";

import { addStockInputSchema } from "@/server/add-stock-input";
import { readItemForm } from "@/server/read-item-form";
import {
  MAX_JSON_BODY_BYTES,
  PayloadTooLargeError,
  readJsonBody,
} from "@/server/read-json-body";

export const MAX_STOCK_FORM_BYTES = 16 * 1024 * 1024;

export async function readStockRequest(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "application/json") {
    return { body: await readJsonBody(request), photos: [] as File[][] };
  }
  if (mediaType !== "multipart/form-data") {
    throw new SyntaxError("Gunakan JSON atau multipart/form-data.");
  }
  if (!request.body) {
    throw new SyntaxError("Body multipart wajib diisi.");
  }

  const form = await readItemForm(request, MAX_STOCK_FORM_BYTES);
  const data = form.getAll("data");
  if (data.length !== 1 || typeof data[0] !== "string") {
    throw new SyntaxError("Field data harus berisi satu JSON string.");
  }
  if (new TextEncoder().encode(data[0]).byteLength > MAX_JSON_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }

  const body = addStockInputSchema.parse(JSON.parse(data[0]));
  const photos: File[][] = Array.from({ length: body.quantity }, () => []);
  for (const [key, value] of form.entries()) {
    if (key === "data") continue;
    const match = /^photo-(0|[1-9]\d*)$/u.exec(key);
    const index = match ? Number(match[1]) : -1;
    if (index < 0 || index >= body.quantity || !(value instanceof File)) {
      throw new SyntaxError("Field foto atau indeks unit tidak valid.");
    }
    photos[index].push(value);
  }
  return {
    body,
    photos: photos.some(files => files.length > 0) ? photos : [],
  };
}
