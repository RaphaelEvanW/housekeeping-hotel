import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma, type StockBatch } from "@/generated/prisma/client";
import { addStockInputSchema } from "@/server/add-stock-input";
import { db } from "@/server/db";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

type AddStockErrorCode =
  | "REQUEST_CONFLICT"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "LOCATION_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "PHOTOS_REQUIRED";

export class AddStockError extends Error {
  constructor(
    public readonly code: AddStockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AddStockError";
  }
}

function batchResult(batch: StockBatch, replayed: boolean) {
  return {
    batch: {
      id: batch.id,
      itemId: batch.itemId,
      quantity: batch.quantity,
      createdAt: batch.createdAt,
    },
    replayed,
  };
}

function replayBatch(
  batch: StockBatch,
  actorId: string,
  requestHash: string,
) {
  if (
    batch.createdById !== actorId ||
    batch.requestHash !== requestHash
  ) {
    throw new AddStockError(
      "REQUEST_CONFLICT",
      "ID request sudah digunakan untuk permintaan lain.",
    );
  }

  return batchResult(batch, true);
}

export async function addStock(
  rawInput: unknown,
  actorId: string,
  photos: File[][] = [],
) {
  const input = addStockInputSchema.parse(rawInput);

  const units = Array.from({ length: input.quantity }, (_, index) => {
    const details = input.units?.[index];

    return {
      serialNumber: details?.serialNumber || null,
      notes: details?.notes || null,
      condition: details?.condition ?? "GOOD",
      // Omit empty names to preserve request hashes for batches created before name support.
      ...(details?.name ? { name: details.name } : {}),
    };
  });

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
          throw new InvalidUnitPhotoError("Setiap foto harus berukuran 1 byte sampai 2 MiB.");
        }
        hashes.push(createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"));
      }
      photoHashes.push(hashes);
    }
  }

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        itemId: input.itemId,
        quantity: input.quantity,
        units,
        ...(input.initialLocationId ? { initialLocationId: input.initialLocationId } : {}),
        ...(photoHashes ? { photoHashes } : {}),
      }),
    )
    .digest("hex");

  const existingBatch = await db.stockBatch.findUnique({
    where: { id: input.requestId },
  });

  if (existingBatch) {
    return replayBatch(existingBatch, actorId, requestHash);
  }

  if (!photoHashes) {
    throw new AddStockError("PHOTOS_REQUIRED", "Setiap unit wajib memiliki minimal satu foto awal.");
  }

  const unitIds = units.map(() => randomUUID());
  const storedKeys: string[] = [];
  const keysByUnitId = new Map<string, string[]>();
  let transactionStarted = false;

  try {
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
    return await db.$transaction(async (tx) => {
      const batch = await tx.stockBatch.create({
        data: {
          id: input.requestId,
          itemId: input.itemId,
          quantity: input.quantity,
          requestHash,
          createdById: actorId,
        },
      });

      const [item] = await tx.$queryRaw<
        { id: string; isActive: boolean }[]
      >`
        SELECT "id", "isActive"
        FROM "item"
        WHERE "id" = ${input.itemId}
        FOR SHARE
      `;

      if (!item) {
        throw new AddStockError(
          "ITEM_NOT_FOUND",
          "Jenis barang tidak ditemukan.",
        );
      }

      if (!item.isActive) {
        throw new AddStockError(
          "ITEM_INACTIVE",
          "Stok tidak dapat ditambahkan ke jenis barang nonaktif.",
        );
      }

      const [storage] = input.initialLocationId ? await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
        SELECT "id", "isActive"
        FROM "location"
        WHERE "id" = ${input.initialLocationId}
        FOR SHARE
      ` : await tx.$queryRaw<
        { id: string; isActive: boolean }[]
      >`
        SELECT "id", "isActive"
        FROM "location"
        WHERE "code" = 'HK_MAIN_STORAGE'
        FOR SHARE
      `;

      if (!storage?.isActive) {
        throw new AddStockError(
          input.initialLocationId ? "LOCATION_UNAVAILABLE" : "STORAGE_UNAVAILABLE",
          input.initialLocationId ? "Lokasi awal yang dipilih tidak tersedia atau nonaktif." : "Lokasi penyimpanan utama belum tersedia atau nonaktif.",
        );
      }

      const createdUnits = await tx.itemUnit.createManyAndReturn({
        data: units.map((unit, index) => ({
          id: unitIds[index],
          ...unit,
          itemId: input.itemId,
          stockBatchId: batch.id,
          locationId: storage.id,
          createdById: actorId,
          updatedById: actorId,
          lifecycle: "ACTIVE",
          custody: "HOUSEKEEPING",
          lossState: "NONE",
          readiness:
            unit.condition === "GOOD"
              ? "CLEAR"
              : "PENDING_INSPECTION",
        })),
      });

      const createdEvents = await tx.auditEvent.createManyAndReturn({
        data: createdUnits.map((unit) => ({
          actorId,
          action: "STOCK_UNIT_CREATED",
          entityType: "ITEM_UNIT",
          entityId: unit.id,
          newValues: {
            itemId: unit.itemId,
            stockBatchId: batch.id,
            unitNumber: unit.unitNumber,
            name: unit.name,
            locationId: unit.locationId,
            serialNumber: unit.serialNumber,
            notes: unit.notes,
            lifecycle: unit.lifecycle,
            custody: unit.custody,
            condition: unit.condition,
            readiness: unit.readiness,
            lossState: unit.lossState,
          },
        })),
      });

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

      return batchResult(batch, false);
    });
  } catch (error) {
    const rollbackKnown = error instanceof AddStockError || (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code)
    );
    // Keep files when COMMIT outcome is unknown: they may be referenced by committed evidence.
    if (!transactionStarted || rollbackKnown) {
      await Promise.allSettled(storedKeys.map(key => removeUnitPhoto(key)));
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const committedBatch = await db.stockBatch.findUnique({
          where: { id: input.requestId },
        });

        if (committedBatch) {
          return replayBatch(committedBatch, actorId, requestHash);
        }
      }

      if (error.code === "P2003") {
        const item = await db.item.findUnique({
          where: { id: input.itemId },
          select: { id: true },
        });

        if (!item) {
          throw new AddStockError(
            "ITEM_NOT_FOUND",
            "Jenis barang tidak ditemukan.",
          );
        }
      }
    }

    throw error;
  }
}
