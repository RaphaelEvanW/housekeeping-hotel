const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_METADATA_BYTES = 256 * 1024;
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

export function stockPhotoError(files: File[]) {
  if (files.length === 0) return "Pilih minimal satu foto awal unit.";
  if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    return "Gunakan foto JPEG, PNG, atau WebP.";
  }
  if (files.some(file => file.size === 0 || file.size > MAX_PHOTO_BYTES)) {
    return "Setiap foto harus berukuran 1 byte sampai 2 MiB.";
  }
  return "";
}

export async function prepareStockUpload<T extends { quantity: number; photos: File[][] }>(attempt: T) {
  const { photos, ...data } = attempt;
  if (photos.length !== data.quantity || photos.some(files => stockPhotoError(files))) {
    throw new Error("Setiap unit wajib memiliki foto JPEG, PNG, atau WebP maksimal 2 MiB.");
  }
  return prepareUnitPhotoUpload(data, photos);
}

export async function prepareUnitPhotoUpload(
  data: object,
  photos: File[][],
  { allowEmptyPhotos = false }: { allowEmptyPhotos?: boolean } = {},
) {
  if (photos.length === 0 || photos.some(files => files.length === 0 ? !allowEmptyPhotos : stockPhotoError(files))) {
    throw new Error("Setiap unit wajib memiliki foto JPEG, PNG, atau WebP maksimal 2 MiB.");
  }
  const metadata = JSON.stringify(data);
  if (new TextEncoder().encode(metadata).byteLength > MAX_METADATA_BYTES) {
    throw new Error("Data terlalu besar. Ringkas nama, nomor seri, atau deskripsi unit.");
  }
  if (photos.flat().reduce((total, file) => total + file.size, 0) >= MAX_UPLOAD_BYTES) {
    throw new Error("Total unggahan maksimal 16 MiB. Kurangi ukuran foto atau jumlah unit.");
  }
  const form = new FormData();
  form.set("data", metadata);
  photos.forEach((files, index) => files.forEach(file => form.append(`photo-${index}`, file)));
  const response = new Response(form);
  const contentType = response.headers.get("Content-Type");
  if (!contentType) throw new Error("Unggahan belum dapat disiapkan. Coba lagi.");
  const body = await response.blob();
  if (body.size > MAX_UPLOAD_BYTES) {
    throw new Error("Total unggahan maksimal 16 MiB. Kurangi ukuran foto atau jumlah unit.");
  }
  return { body, contentType };
}
