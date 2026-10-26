# BE foto wajib pada Tambah unit — panduan patch

Base source: d1997e7, feature/backend, 26 Oktober 2026. Status terbaru: atas permintaan owner, patch berikut sudah diterapkan ke source/tests pada working tree. Agent belum menjalankan checks; owner menjalankan urutan bagian8. Nomor baris dan blok di bawah merupakan acuan patch dari base, bukan nomor baris source setelah edit.

Scope: POST stock-batches menerima foto langsung melalui multipart; batch/unit/audit/referensi foto tetap satu transaksi database. Tidak menambah tabel draft, endpoint upload terpisah, dependency, atau migrasi. File privat memakai helper existing.

Kontrak multipart:
- `data`: satu JSON string berisi requestId/itemId/quantity/units/initialLocationId seperti sekarang.
- `photo-0`, `photo-1`, dst: File untuk unit indeks tersebut, mulai0. Nama field boleh berulang untuk beberapa foto pada unit yang sama; minimal1per unit.
- JPEG/PNG/WebP statis, maksimal2MiB per foto, body multipart maksimal16MiB termasuk framing, metadata maksimal256KiB. Jumlah unit1–100 tetap; batch dengan foto besar harus diperkecil/dikompresi agar muat batas transport. Batas16MiB mencegah pengumpulan200MiB gambar sekaligus di memori dan bisa ditinjau sesuai deployment.
- JSON lama hanya dapat replay batch yang sudah committed dengan hash lama. Batch baru tanpa foto ditolak PHOTOS_REQUIRED. Selama FE belum mengirim foto, form Tambah unit existing akan menerima penolakan tersebut. Jangan menyebut ini FE sudah berfungsi.
- File/foto baru ikut fingerprint requestId; retry harus membawa metadata dan bytes foto yang sama, urutan file per unit sama. Filename/MIME client tidak menjadi path atau identitas evidence.

## Peta baris sebelum edit

Nomor ini berdasarkan commit d1997e7. Setelah penambahan baris, ikuti anchor/nama blok yang dijelaskan pada setiap langkah.

| File | Baris sekarang | Bagian |
| --- | --- | --- |
| src/server/read-item-form.ts | 8,18 | signature dan batas body |
| src/server/add-stock.ts | 8,55 | union error dan signature |
| src/server/add-stock.ts | sebelum70 | hashes foto setelah units |
| src/server/add-stock.ts | setelah87/sebelum89 | guard foto baru dan state staging |
| src/server/add-stock.ts | 89–90 | staging sebelum transaction |
| src/server/add-stock.ts | 145–146 | UUID unit pada bulk create |
| src/server/add-stock.ts | 163, sebelum186 | audit return + metadata foto |
| src/server/add-stock.ts | setelah188 | cleanup sebelum catch existing |
| src/server/item-photo.ts | 66 | writeFile cleanup |
| src/app/api/stock-batches/route.ts | 22,28,31,50,57,75 | media/body/service/errors |
| tests/integration/add-stock-api.test.ts | 33,134,527,557 | helper/cleanup/JSON/legacy |

## 1. Bounded multipart reader existing

File `src/server/read-item-form.ts`.

Ubah signature saja:

```ts
export async function readItemForm(request: Request, maxBytes = MAX_FORM_BYTES) {
```

Ubah kondisi `if (size > MAX_FORM_BYTES)` menjadi:

```ts
if (size > maxBytes) {
```

Bagian lain tetap. Default katalog tetap2MiB+64KiB; hanya pemanggil stock baru yang memakai16MiB.

## 2. Tambahkan reader request stock

File baru `src/server/read-stock-request.ts`:

```ts
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
```

Parse schema pada reader menjaga indeks dan jumlah saat membentuk matrix. Service tetap melakukan validasi sendiri karena juga dapat dipanggil internal; bukan mempercayai body/file path dari client.

## 3. Perluas service Add Stock per blok

File `src/server/add-stock.ts`.

### 3a. Imports dan kode error

Ubah import crypto menjadi:

```ts
import { createHash, randomUUID } from "node:crypto";
```

Tambah imports:

```ts
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";
```

Tambahkan `| "PHOTOS_REQUIRED"` pada union AddStockErrorCode, sebelum titik koma terakhir.

Ubah signature addStock, bukan seluruh function:

```ts
export async function addStock(
  rawInput: unknown,
  actorId: string,
  photos: File[][] = [],
) {
```

### 3b. Hash bytes foto dan validasi susunan

Setelah blok `const units = Array.from(...)` selesai dan SEBELUM `const requestHash`, tambahkan:

```ts
let photoHashes: string[][] | undefined;
if (photos.length > 0) {
  if (photos.length !== input.quantity || photos.some(files => !Array.isArray(files) || files.length === 0)) {
    throw new AddStockError("PHOTOS_REQUIRED", "Setiap unit wajib memiliki minimal satu foto awal.");
  }
  photoHashes = [];
  for (const files of photos) {
    const hashes: string[] = [];
    for (const file of files) {
      if (!(file instanceof File) || file.size === 0 || file.size > MAX_PHOTO_BYTES) {
        throw new InvalidUnitPhotoError("Setiap foto harus berukuran1byte sampai2MiB.");
      }
      hashes.push(createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"));
    }
    photoHashes.push(hashes);
  }
}
```

Di object JSON untuk requestHash, setelah spread initialLocationId, tambahkan satu baris:

```ts
...(photoHashes ? { photoHashes } : {}),
```

Ini memakai hash bytes asli, bukan hasil encode yang bisa berubah jika sharp di-upgrade. Tidak menambahkan property bila tidak ada foto, sehingga replay hash legacy tetap sama.

### 3c. Wajib foto SETELAH pengecekan existingBatch

Pertahankan blok existingBatch/replayBatch apa adanya. Setelah blok itu dan SEBELUM `try {`, tambahkan:

```ts
if (!photoHashes) {
  throw new AddStockError("PHOTOS_REQUIRED", "Setiap unit wajib memiliki minimal satu foto awal.");
}

const unitIds = units.map(() => randomUUID());
const storedKeys: string[] = [];
const keysByUnitId = new Map<string, string[]>();
let transactionStarted = false;
```

Dengan posisi ini batch lama yang sudah tersimpan tetap dapat replay tanpa foto; batch baru tidak punya pengecualian.

### 3d. Siapkan file sebelum transaksi database

Di dalam `try`, tepat SEBELUM `return await db.$transaction(...)`, tambahkan:

```ts
for (const [index, files] of photos.entries()) {
  const keys: string[] = [];
  for (const file of files) {
    const prepared = await prepareUnitPhoto(file);
    const key = await storeUnitPhoto(prepared);
    storedKeys.push(key);
    keys.push(key);
  }
  keysByUnitId.set(unitIds[index], keys);
}
transactionStarted = true;
```

File di-decode/re-encode secara berurutan, di luar koneksi transaksi. Storage key dibuat server, bukan dikirim client.

### 3e. Pasangkan unit dengan foto berdasarkan UUID

Dalam `tx.itemUnit.createManyAndReturn`, ubah:

```ts
 data: units.map((unit) => ({
```

menjadi:

```ts
 data: units.map((unit, index) => ({
   id: unitIds[index],
```

Pertahankan seluruh field lainnya, termasuk `...unit`, kondisi/readiness/lokasi/actor.

Ubah satu baris pemanggilan audit:

```ts
await tx.auditEvent.createMany({
```

menjadi:

```ts
const createdEvents = await tx.auditEvent.createManyAndReturn({
```

Payload audit tidak perlu diganti. Setelah penutup pemanggilan audit, SEBELUM `return batchResult(batch, false)`, tambahkan:

```ts
await tx.itemUnitPhoto.createMany({
  data: createdEvents.flatMap(event => {
    const keys = keysByUnitId.get(event.entityId);
    if (!keys?.length) {
      throw new AddStockError("PHOTOS_REQUIRED", "Referensi foto unit tidak lengkap.");
    }
    return keys.map(photoKey => ({
      unitId: event.entityId,
      auditEventId: event.id,
      photoKey,
    }));
  }),
});
```

Jangan pasangkan foto dengan `createdUnits[index]` atau `createdEvents[index]`: urutan hasil bulk-return tidak dijamin. UUID input dan entityId audit menjadi pemetaan yang stabil.

### 3f. Cleanup hanya jika belum ada transaksi atau rollback diketahui

Di catch luar `addStock`, SEBELUM blok existing `if (error instanceof Prisma.PrismaClientKnownRequestError)`, tambahkan:

```ts
const rollbackKnown = error instanceof AddStockError || (
  error instanceof Prisma.PrismaClientKnownRequestError &&
  ["P2002", "P2003", "P2034"].includes(error.code)
);
if (!transactionStarted || rollbackKnown) {
  await Promise.allSettled(storedKeys.map(key => removeUnitPhoto(key)));
}
```

Pertahankan penanganan existing P2002 replay dan P2003 item-not-found. Setiap attempt memiliki storage key sendiri, sehingga cleanup attempt yang kalah tidak menghapus foto attempt yang menang.

Jika hasil COMMIT tidak diketahui (misalnya koneksi putus), JANGAN hapus file: transaksi mungkin sudah committed. File yang tidak terpakai bisa tertinggal privat; jangan menjalankan penghapusan massal. Pembersihan orphan perlu rekonsiliasi terpisah yang membuktikan file tidak direferensikan setelah transaksi lama selesai. Database records bersifat atomic; filesystem bukan bagian transaksi SQL. Ini batas operasional yang nyata, bukan alasan mengklaim disk/DB sepenuhnya atomic.

## 4. Amankan partial write file

File `src/server/item-photo.ts`, fungsi `storePhoto`.

Ganti HANYA baris `await writeFile(...)` dengan:

```ts
try {
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
} catch (error) {
  // EEXIST means the file was not created by this attempt.
  if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
    await rm(file, { force: true }).catch(() => undefined);
  }
  throw error;
}
```

`return key`, mkdir, path validation dan randomUUID tetap. Jika write gagal setelah file dibuat sebagian, jangan biarkan file parsial. Jangan menghapus file existing saat exclusive create menolak EEXIST.

## 5. Sambungkan route existing

File `src/app/api/stock-batches/route.ts`.

### 5a. Imports

Hapus `readJsonBody` dari import read-json-body; `PayloadTooLargeError` tetap.

Tambah:

```ts
import { readStockRequest } from "@/server/read-stock-request";
import { InvalidUnitPhotoError } from "@/server/unit-photo";
```

### 5b. Media types dan reader

Ubah pemanggilan validator saja:

```ts
const rejectedRequest = validateMutationRequest(request, [
  "application/json",
  "multipart/form-data",
]);
```

Setelah `let body: unknown;`, tambahkan:

```ts
let photos: File[][] = [];
```

Di try reader, ganti `body = await readJsonBody(request);` dengan:

```ts
const parsed = await readStockRequest(request);
body = parsed.body;
photos = parsed.photos;
```

Catch reader kini juga harus menangani ZodError dari metadata multipart. Setelah `const tooLarge = ...`, tambahkan:

```ts
if (!tooLarge && !(error instanceof SyntaxError) && !(error instanceof ZodError) && !(error instanceof TypeError)) {
  throw error;
}
```

TypeError di blok ini berasal dari decoding multipart boundary/body yang rusak; bukan catch untuk service/DB/storage.

Ganti pesan413 pada blok reader menjadi:

```ts
"Ukuran JSON/metadata maksimal256KiB; total multipart maksimal16MiB."
```

Status/error code dan headers tetap. Pesan400 boleh memakai `"Format data penambahan unit tidak valid."` karena kini mencakup multipart, bukan hanya JSON.

### 5c. Service dan error foto

Ubah pemanggilan service menjadi:

```ts
const result = await addStock(body, authorization.user.id, photos);
```

Di catch SERVICE, sebelum pemeriksaan ZodError, tambahkan:

```ts
if (error instanceof InvalidUnitPhotoError) {
  return Response.json(
    { error: "INVALID_PHOTO", message: error.message },
    { status: 400, headers: responseHeaders },
  );
}
```

Di `statusByCode`, tambah:

```ts
PHOTOS_REQUIRED: 400,
```

Pada `src/server/validate-mutation-request.ts`, ganti HANYA pesan unsupported media agar sesuai allowed types:

```ts
message: `Permintaan harus menggunakan ${allowedMediaTypes.join(" atau ")}.`,
```

Pemanggil default tetap menghasilkan pesan application/json yang sama; pengecekan origin/role tidak berubah.

## 6. Sesuaikan tes existing, bukan membuangnya

File `tests/integration/add-stock-api.test.ts`.

### 6a. Imports

Tambah:

```ts
import sharp from "sharp";
import * as unitPhotos from "../../src/server/unit-photo";
```

### 6b. Pertahankan helper JSON, tambah helper multipart

Ubah HANYA nama function existing `postStock(body: unknown)` menjadi `postLegacyStock(body: unknown)`. Isi helper JSON itu tetap untuk boundary tests dan replay legacy.

Setelah helper tersebut, tambahkan function baru:

```ts
async function stockPhoto(color = "#131B2E") {
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: color },
  }).png().toBuffer();
  return new File([new Uint8Array(bytes)], "unit.png", { type: "image/png" });
}

async function postStock(body: unknown, suppliedPhotos?: File[][]) {
  const quantity = body && typeof body === "object" && "quantity" in body
    ? body.quantity : undefined;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return postLegacyStock(body);
  }
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  const defaultPhoto = suppliedPhotos ? undefined : await stockPhoto();
  for (let index = 0; index < quantity; index++) {
    const files = suppliedPhotos?.[index] ?? (defaultPhoto ? [defaultPhoto] : []);
    for (const file of files) form.append(`photo-${index}`, file);
  }
  return POST(new Request("http://localhost/api/stock-batches", {
    method: "POST", headers: { Origin: "http://localhost:3000" }, body: form,
  }));
}
```

Bila `suppliedPhotos` diberikan, jangan isi kelompok kosong dengan foto default. Itu diperlukan untuk menguji foto hilang. PNG fixture deterministik menjaga fingerprint retry sama; timestamp File bukan bagian hash bytes.

### 6c. Cleanup metadata sebelum audit/unit

Pada afterEach existing, sebelum `await db.$transaction([`, tambahkan:

```ts
vi.restoreAllMocks();
const photos = await db.itemUnitPhoto.findMany({
  where: { unit: { createdById: userId } }, select: { photoKey: true },
});
```

Sebagai operasi PERTAMA di array `$transaction`, tambah:

```ts
db.itemUnitPhoto.deleteMany({ where: { unit: { createdById: userId } } }),
```

Setelah `$transaction([...])` selesai, sebelum `userId = undefined`, tambah:

```ts
await Promise.all(photos.map(photo => unitPhotos.removeUnitPhoto(photo.photoKey)));
```

Foto fixture dibuang hanya setelah row metadata terhapus. Jangan menghapus bukti produksi. Filter actor/test env existing tetap.

### 6d. Legacy hash case harus meniru batch yang sudah committed

Dalam test berjudul `keeps the pre-name request hash...`, batch legacy tidak boleh dibuat lagi melalui POST baru yang memang sekarang wajib foto.

Ganti HANYA `expect((await postStock(input)).status).toBe(201);` pada test itu dengan:

```ts
await db.$transaction(async tx => {
  await tx.stockBatch.create({ data: {
    id: input.requestId, itemId, quantity: input.quantity,
    requestHash: legacyHash, createdById: actor.id,
  } });
  const oldUnits = await tx.itemUnit.createManyAndReturn({ data:
    Array.from({ length: input.quantity }, () => ({
      itemId, stockBatchId: input.requestId, locationId: storageId,
      createdById: actor.id, updatedById: actor.id,
    })),
  });
  await tx.auditEvent.createMany({ data: oldUnits.map(unit => ({
    actorId: actor.id, action: "STOCK_UNIT_CREATED",
    entityType: "ITEM_UNIT", entityId: unit.id,
  })) });
});
```

Pada test legacy ITU SAJA, ubah dua pemanggilan retry `postStock(...)` berikutnya menjadi `postLegacyStock(...)`. Assertion hash/count tetap. Fixture ini menggambarkan records sebelum kebijakan foto, bukan bypass pada service produksi.

Pada test `rejects oversized JSON...`, ubah pemanggilan `postStock` menjadi `postLegacyStock` agar tetap menguji JSON reader, bukan metadata multipart. Tests origin/content-type/malformed JSON existing tetap.

### 6e. Tambahkan regresi foto

Tambahkan di akhir test file existing:

```ts
it("requires photos for new JSON stock without changing existing data", async () => {
  const response = await postLegacyStock(stockInput());
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "PHOTOS_REQUIRED" });
  await expectCounts(0, 0);
});

it("requires photos for every unit and validates actual image bytes", async () => {
  expect((await postStock(stockInput(), [[await stockPhoto()], []])).status).toBe(400);
  const invalid = new File(["not a photo"], "fake.png", { type: "image/png" });
  expect((await postStock(stockInput(), [[invalid], [await stockPhoto()]])).status).toBe(400);
  await expectCounts(0, 0);
});

it("binds different photos to the right unit/event and replays without duplicate evidence", async () => {
  const input = { ...stockInput(), units: [{ name: "Unit A" }, { name: "Unit B" }] };
  const files = [[await stockPhoto("#ff0000")], [await stockPhoto("#0000ff")]];
  expect((await postStock(input, files)).status).toBe(201);
  expect((await postStock(input, files)).status).toBe(200);

  const units = await db.itemUnit.findMany({ where: { stockBatchId: input.requestId }, include: {
    photos: { include: { auditEvent: true } },
  } });
  expect(units).toHaveLength(2);
  for (const unit of units) {
    const index = unit.name === "Unit A" ? 0 : 1;
    expect(unit.photos).toHaveLength(1);
    expect(unit.photos[0].auditEvent).toMatchObject({
      entityType: "ITEM_UNIT", entityId: unit.id, action: "STOCK_UNIT_CREATED", actorId: actor.id,
    });
    expect(await unitPhotos.readUnitPhoto(unit.photos[0].photoKey))
      .toEqual(await unitPhotos.prepareUnitPhoto(files[index][0]));
  }
  const changed = [[await stockPhoto("#00ff00")], files[1]];
  expect((await postStock(input, changed)).status).toBe(409);
  await expectCounts(2, 1);
});

it("rolls back units/batch/audits if photo metadata fails and cleans uncommitted files", async () => {
  const originalStore = unitPhotos.storeUnitPhoto;
  let sharedKey: string | undefined;
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(async bytes => {
    sharedKey ??= await originalStore(bytes);
    return sharedKey;
  });
  // The duplicate key forces a real metadata unique-constraint failure inside SQL transaction.
  await expect(postStock(stockInput())).rejects.toMatchObject({ code: "P2002" });
  await expectCounts(0, 0);
  expect(await db.itemUnitPhoto.count({ where: { unit: { createdById: actor.id } } })).toBe(0);
  if (!sharedKey) throw new Error("Expected staged fixture file");
  await expect(unitPhotos.readUnitPhoto(sharedKey)).rejects.toMatchObject({ code: "ENOENT" });
});
```

Tambahkan assertion jumlah foto2 pada test concurrent same request existing setelah `expectCounts(2,1)`:

```ts
expect(await db.itemUnitPhoto.count({ where: { unit: { createdById: actor.id } } })).toBe(2);
```

Ini penting karena status200/201 saja belum membuktikan tidak ada bukti ganda. Jangan menghapus tes kondisi/lokasi/permissions/stock derivation sebelumnya.

## 7. Tes parser multipart

File baru `tests/unit/read-stock-request.test.ts`:

```ts
import { expect, it } from "vitest";
import { readStockRequest } from "../../src/server/read-stock-request";
import { readItemForm } from "../../src/server/read-item-form";
import { PayloadTooLargeError } from "../../src/server/read-json-body";

const input = {
  requestId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0",
  itemId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0", quantity: 2,
};
function request(form: FormData) {
  return new Request("http://localhost/stock", { method: "POST", body: form });
}
function form() {
  const data = new FormData(); data.set("data", JSON.stringify(input)); return data;
}

it("groups repeated photo fields by exact unit index", async () => {
  const data = form();
  data.append("photo-1", new File(["b"], "b.png"));
  data.append("photo-0", new File(["a"], "a.png"));
  data.append("photo-0", new File(["c"], "c.png"));
  const result = await readStockRequest(request(data));
  expect(result.photos.map(files => files.map(file => file.name))).toEqual([["a.png", "c.png"], ["b.png"]]);
});

it.each(["photo-2", "photo--1", "photo-00", "photoKey"])("rejects invalid field/index %s", async key => {
  const data = form(); data.append(key, new File(["a"], "a.png"));
  await expect(readStockRequest(request(data))).rejects.toBeInstanceOf(SyntaxError);
});

it("rejects non-file photo fields and duplicate metadata", async () => {
  const nonFile = form(); nonFile.append("photo-0", "file-path.webp");
  await expect(readStockRequest(request(nonFile))).rejects.toBeInstanceOf(SyntaxError);
  const duplicate = form(); duplicate.append("data", JSON.stringify(input));
  await expect(readStockRequest(request(duplicate))).rejects.toBeInstanceOf(SyntaxError);
});

it("keeps JSON readable for legacy replay without inventing photos", async () => {
  const result = await readStockRequest(new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
  expect(result).toEqual({ body: input, photos: [] });
});

it("enforces an explicit multipart stream limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(65)); },
    cancel() { cancelled = true; },
  });
  const req = new Request("http://localhost/stock", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: stream, duplex: "half",
  } as RequestInit);
  await expect(readItemForm(req, 64)).rejects.toBeInstanceOf(PayloadTooLargeError);
  expect(cancelled).toBe(true);
});
```

File[] parser test hanya menguji grouping, bukan decoding image. Image bytes diverifikasi oleh unit-photo tests dan service integration tests, bukan dipercaya dari file extension.

## 8. Urutan checks oleh owner

Tidak ada migrasi/schema baru pada tahap ini.

```bash
npm.cmd run lint
npm.cmd run typecheck
npx.cmd vitest run tests/unit/read-stock-request.test.ts tests/unit/unit-photo.test.ts tests/unit/read-item-form.test.ts
npx.cmd vitest run tests/integration/add-stock-api.test.ts tests/integration/unit-photo-api.test.ts tests/integration/item-catalog.test.ts
npm.cmd test
```

Hasil belum diketahui: agent sudah menerapkan patch dan meninjau source/diff, tetapi belum menguji kode ini. Laporkan error bila ada; jangan bypass tests dengan menonaktifkan wajib foto atau menghapus guards.

Setelah checks BE passed, commit checkpoint SEBELUM pindah FE. FE berikutnya memerlukan field file per unit, FormData, frozen File references untuk retry, dan rendering lampiran history. Jangan commit/push dari agent tanpa instruksi.

## Catatan penerapan — 26 Oktober 2026

Patch diterapkan tanpa perubahan FE/schema/migrasi/dependency. Reader juga menolak body multipart kosong; tes tambahan mencakup batas metadata/stream, boundary rusak, batas per-file, multi-photo dalam satu event, cleanup staging yang gagal, dan retensi file saat hasil transaksi belum pasti. Testing dan konfirmasi hasil tetap owner.
