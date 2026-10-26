import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_CATALOG_PHOTOS = 10;
export const MAX_CATALOG_FORM_BYTES = 16 * 1024 * 1024;

export class InvalidItemPhotoError extends Error {}
type PhotoScope = "item" | "unit";

function photoPath(key: string, scope: PhotoScope = "item") {
  if (!/^[0-9a-f-]{36}\.webp$/u.test(key))
    throw new InvalidItemPhotoError("Foto tidak valid.");

  const directory = scope === "unit" ? "unit-photos" : "item-photos";
  const configuredDirectory =
    scope === "unit" ? process.env.UNIT_PHOTO_DIR : process.env.ITEM_PHOTO_DIR;

  const root =
    process.env.NODE_ENV === "test"
      ? join(process.cwd(), ".data", `test-${directory}`)
      : resolve(configuredDirectory || join(process.cwd(), ".data", directory));
  return { root, file: join(root, key) };
}

export async function preparePhoto(file: File): Promise<Buffer> {
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES)
    throw new InvalidItemPhotoError("Foto maksimal 2 MiB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp)
    throw new InvalidItemPhotoError("Gunakan foto JPEG, PNG, atau WebP.");
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    if ((metadata.pages ?? 1) > 1) throw new Error("Animated image");
    return await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new InvalidItemPhotoError(
      "Foto tidak dapat dibaca. Gunakan gambar statis maksimal 20 megapiksel.",
    );
  }
}

export async function storePhoto(bytes: Buffer, scope: PhotoScope = "item") {
  const key = `${randomUUID()}.webp`;
  const { root, file } = photoPath(key, scope);
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    // EEXIST means the file was not created by this attempt.
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      await rm(file, { force: true }).catch(() => undefined);
    }
    throw error;
  }
  return key;
}

export function readPhoto(key: string, scope: PhotoScope = "item") {
  return readFile(photoPath(key, scope).file);
}
export function removePhoto(key: string, scope: PhotoScope = "item") {
  return rm(photoPath(key, scope).file, { force: true });
}

export async function itemPhotoResponse(key: string | null | undefined) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!key) return new Response(null, { status: 404, headers });
  try {
    const bytes = await readPhoto(key);
    return new Response(new Uint8Array(bytes), { headers: {
      ...headers,
      "Content-Type": "image/webp",
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Response(null, { status: 404, headers });
    throw error;
  }
}

export {
  preparePhoto as prepareItemPhoto,
  storePhoto as storeItemPhoto,
  readPhoto as readItemPhoto,
  removePhoto as removeItemPhoto,
};
