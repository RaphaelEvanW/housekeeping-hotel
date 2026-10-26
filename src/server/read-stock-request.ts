import "server-only";

import { addStockInputSchema } from "@/server/add-stock-input";
import { readJsonBody } from "@/server/read-json-body";
import {
  MAX_UNIT_PHOTO_FORM_BYTES,
  readUnitPhotoForm,
} from "@/server/read-unit-photo-form";

export const MAX_STOCK_FORM_BYTES = MAX_UNIT_PHOTO_FORM_BYTES;

export async function readStockRequest(request: Request) {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (mediaType === "application/json") {
    return { body: await readJsonBody(request), photos: [] as File[][] };
  }
  if (mediaType !== "multipart/form-data") {
    throw new SyntaxError("Gunakan JSON atau multipart/form-data.");
  }
  return readUnitPhotoForm(
    request,
    (raw) => addStockInputSchema.parse(raw),
    (body) => body.quantity,
  );
}
