# Backend Edit Jenis Barang: nama dan deskripsi

Panduan untuk diterapkan owner. Kode backend di bawah belum dipasang atau diuji. FE sudah mengirim `{ name, description }`; endpoint saat ini masih menolak description. Jangan menganggap penyimpanan deskripsi sudah bekerja sebelum seluruh langkah selesai.

Tidak perlu migration: Item.description sudah ada. Foto, status, unit fisik dan permission tidak diubah. Name-only callers tetap valid; deskripsi yang tidak dikirim dipertahankan, string kosong menghapusnya menjadi null.

## 1. D:/Raphael/Projects/Housekeeping/housekeeping/src/server/item-input.ts

Ganti seluruh updateItemInputSchema dengan:

```ts
export const updateItemInputSchema = z
  .object({
    name: itemNameSchema,
    description: z
      .string()
      .trim()
      .max(2000, "Deskripsi maksimal 2000 karakter.")
      .optional(),
  })
  .strict();
```

## 2. D:/Raphael/Projects/Housekeeping/housekeeping/src/server/items.ts

Ganti import dari @/server/item-input menjadi:

```ts
import {
  createItemInputSchema,
  itemNameSchema,
  updateItemInputSchema,
} from "@/server/item-input";
```

Ganti seluruh fungsi updateItemName, termasuk signature dan body-nya, dengan:

```ts
export async function updateItem(
  itemId: string,
  rawInput: unknown,
  actorId: string,
) {
  const input = updateItemInputSchema.parse(rawInput);
  const preparedName = prepareItemName(input.name);

  try {
    return await db.$transaction(async (tx) => {
      const lockedItems = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "item"
        WHERE "id" = ${itemId}
        FOR UPDATE
      `;

      if (lockedItems.length === 0) {
        throw new ItemNotFoundError();
      }

      const before = await tx.item.findUniqueOrThrow({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          normalizedName: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const description =
        input.description === undefined
          ? before.description
          : input.description || null;
      const descriptionChanged = description !== before.description;

      if (
        before.name === preparedName.name &&
        before.normalizedName === preparedName.normalizedName &&
        !descriptionChanged
      ) {
        return {
          id: before.id,
          name: before.name,
          description: before.description,
          isActive: before.isActive,
          createdAt: before.createdAt,
          updatedAt: before.updatedAt,
        };
      }

      const item = await tx.item.update({
        where: { id: itemId },
        data: {
          ...preparedName,
          description,
          updatedById: actorId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId,
          action: "ITEM_UPDATED",
          entityType: "ITEM",
          entityId: item.id,
          oldValues: {
            name: before.name,
            normalizedName: before.normalizedName,
            ...(descriptionChanged
              ? { description: before.description }
              : {}),
          },
          newValues: {
            name: item.name,
            normalizedName: preparedName.normalizedName,
            ...(descriptionChanged ? { description } : {}),
          },
        },
      });

      return item;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DuplicateItemNameError();
    }

    throw error;
  }
}
```

FOR UPDATE dan transaksi existing menjaga audit berurutan. Audit description ditambahkan ketika nilainya berubah; audit rename-only existing tidak berubah formatnya. No-op tidak mengubah updatedAt atau membuat audit.

## 3. D:/Raphael/Projects/Housekeeping/housekeeping/src/app/api/items/[itemId]/route.ts

Dalam import dari @/server/items, ganti updateItemName menjadi updateItem:

```ts
import {
  DuplicateItemNameError,
  ItemNotFoundError,
  updateItem,
} from "@/server/items";
```

Ganti pemanggilan service:

```ts
const item = await updateItem(
  parsedId.data,
  parsed.data,
  authorization.user.id,
);
```

Ganti message dalam blok !parsed.success:

```ts
message: "Data perubahan jenis barang tidak valid.",
```

Pertahankan authorization, origin/content-type, body limit, response headers dan error mapping existing.

## 4. D:/Raphael/Projects/Housekeeping/housekeeping/tests/integration/items-api.test.ts

Tambahkan test berikut di luar test lainnya. createEditableItem, patchItem dan db sudah tersedia dalam file ini.

```ts
it("updates, preserves and clears item description with an audit", async () => {
  const item = await createEditableItem();

  const updated = await patchItem(item.id, {
    name: item.name,
    description: "  Peralatan kamar tamu.  ",
  });
  expect(updated.status).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({
    item: { id: item.id, description: "Peralatan kamar tamu." },
  });

  const beforeNoop = await db.item.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect((await patchItem(item.id, { name: item.name })).status).toBe(200);
  const afterNoop = await db.item.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(afterNoop.description).toBe("Peralatan kamar tamu.");
  expect(afterNoop.updatedAt).toEqual(beforeNoop.updatedAt);
  expect(afterNoop.photoKey).toBe(item.photoKey);

  expect((await patchItem(item.id, {
    name: item.name,
    description: "   ",
  })).status).toBe(200);
  expect((await db.item.findUniqueOrThrow({
    where: { id: item.id },
  })).description).toBeNull();

  const events = await db.auditEvent.findMany({
    where: { entityId: item.id },
  });
  expect(events).toHaveLength(2);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      oldValues: expect.objectContaining({ description: null }),
      newValues: expect.objectContaining({ description: "Peralatan kamar tamu." }),
    }),
    expect.objectContaining({
      oldValues: expect.objectContaining({ description: "Peralatan kamar tamu." }),
      newValues: expect.objectContaining({ description: null }),
    }),
  ]));
});

it("rolls back description when the replacement name already exists", async () => {
  const first = await createEditableItem();
  const second = await createEditableItem();
  expect((await patchItem(second.id, {
    name: first.name,
    description: "Tidak boleh tersimpan.",
  })).status).toBe(409);
  const stored = await db.item.findUniqueOrThrow({
    where: { id: second.id },
  });
  expect(stored.name).toBe(second.name);
  expect(stored.description).toBe(second.description);
  expect(await db.auditEvent.count({
    where: { entityId: second.id },
  })).toBe(0);
});
```

Dalam array kasus rejects invalid update input, tambahkan:

```ts
{ name: "Changed", description: 123 },
{ name: "Changed", description: null },
{ name: "Changed", description: "A".repeat(2001) },
```

## 5. Pemeriksaan setelah semua langkah selesai

Jalankan dari D:/Raphael/Projects/Housekeeping/housekeeping. Database test harus menyala dan migrations existing sudah terpasang. Jika belum, jalankan npm.cmd run db:up dan npm.cmd run db:migrate:test terlebih dahulu. Tidak perlu migration baru atau db reset.

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:unit
npx.cmd vitest run tests/integration/items-api.test.ts --no-file-parallelism
```

Setelah passed, cek browser: buka Edit, ubah deskripsi, simpan, buka ulang/reload untuk memastikan persisted. Kosongkan lalu simpan untuk menghapus. Kirim hasil pemeriksaan untuk mencatat verifikasi aktual di DEVLOG; jangan mencatat test BE passed sebelum dijalankan.
