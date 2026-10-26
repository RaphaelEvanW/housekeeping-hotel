import sharp from "sharp";
import { afterEach, expect, it } from "vitest";

import {
  readItemPhoto,
  removeItemPhoto,
  storeItemPhoto,
} from "../../src/server/item-photo";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  readUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "../../src/server/unit-photo";

const unitKeys: string[] = [];
const itemKeys: string[] = [];

afterEach(async () => {
  await Promise.all([
    ...unitKeys.splice(0).map(removeUnitPhoto),
    ...itemKeys.splice(0).map(key => removeItemPhoto(key)),
  ]);
});

async function preparedPhoto() {
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: "#131B2E" },
  }).png().toBuffer();

  return prepareUnitPhoto(
    new File([new Uint8Array(bytes)], "unit.png", { type: "image/png" }),
  );
}

it("stores WebP separately for unit evidence and catalog photos", async () => {
  const prepared = await preparedPhoto();
  const unitKey = await storeUnitPhoto(prepared);
  unitKeys.push(unitKey);
  const itemKey = await storeItemPhoto(prepared);
  itemKeys.push(itemKey);

  expect(await readUnitPhoto(unitKey)).toEqual(prepared);
  expect(await readItemPhoto(itemKey)).toEqual(prepared);
  expect((await sharp(await readUnitPhoto(unitKey)).metadata()).format).toBe("webp");
  await expect(readItemPhoto(unitKey)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readUnitPhoto(itemKey)).rejects.toMatchObject({ code: "ENOENT" });
});

it("rejects invalid images and oversized uploads", async () => {
  await expect(prepareUnitPhoto(
    new File(["not an image"], "fake.png", { type: "image/png" }),
  )).rejects.toBeInstanceOf(InvalidUnitPhotoError);
  await expect(prepareUnitPhoto(
    new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "large.png"),
  )).rejects.toBeInstanceOf(InvalidUnitPhotoError);
});

it("rejects path traversal before accessing disk", () => {
  expect(() => readUnitPhoto("../outside.webp")).toThrow(InvalidUnitPhotoError);
  expect(() => removeUnitPhoto("../outside.webp")).toThrow(InvalidUnitPhotoError);
});
