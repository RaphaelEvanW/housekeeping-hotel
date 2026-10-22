import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export class InvalidItemPhotoError extends Error {}

function photoPath(key: string) {
  if (!/^[0-9a-f-]{36}\.webp$/u.test(key)) throw new InvalidItemPhotoError("Foto tidak valid.");
  const root = process.env.NODE_ENV === "test"
    ? join(process.cwd(), ".data", "test-item-photos")
    : resolve(process.env.ITEM_PHOTO_DIR || join(process.cwd(), ".data", "item-photos"));
  return { root, file: join(root, key) };
}

export async function prepareItemPhoto(file: File): Promise<Buffer> {
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) throw new InvalidItemPhotoError("Foto maksimal 2 MiB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new InvalidItemPhotoError("Gunakan foto JPEG, PNG, atau WebP.");
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) throw new Error("Animated image");
    return await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new InvalidItemPhotoError("Foto tidak dapat dibaca. Gunakan gambar statis maksimal 20 megapiksel.");
  }
}

export async function storeItemPhoto(bytes: Buffer) {
  const key = `${randomUUID()}.webp`;
  const { root, file } = photoPath(key);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  return key;
}

export function readItemPhoto(key: string) { return readFile(photoPath(key).file); }
export function removeItemPhoto(key: string) { return rm(photoPath(key).file, { force: true }); }
