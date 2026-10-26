import "server-only";

import { readPhoto, removePhoto, storePhoto } from "@/server/item-photo";

export {
  MAX_PHOTO_BYTES,
  InvalidItemPhotoError as InvalidUnitPhotoError,
  preparePhoto as prepareUnitPhoto,
} from "@/server/item-photo";

export function storeUnitPhoto(bytes: Buffer) {
  return storePhoto(bytes, "unit");
}

export function readUnitPhoto(key: string) {
  return readPhoto(key, "unit");
}

// Draft/rollback cleanup only; finalized evidence is retained by its workflow.
export function removeUnitPhoto(key: string) {
  return removePhoto(key, "unit");
}
