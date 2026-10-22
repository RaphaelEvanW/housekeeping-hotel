import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type StockBatch } from "@/generated/prisma/client";
import { addStockInputSchema } from "@/server/add-stock-input";
import { db } from "@/server/db";

type AddStockErrorCode =
  | "REQUEST_CONFLICT"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "LOCATION_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE";

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

export async function addStock(rawInput: unknown, actorId: string) {
  const input = addStockInputSchema.parse(rawInput);

  const units = Array.from({ length: input.quantity }, (_, index) => {
    const details = input.units?.[index];

    return {
      serialNumber: details?.serialNumber || null,
      notes: details?.notes || null,
      condition: details?.condition ?? "GOOD",
    };
  });

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        itemId: input.itemId,
        quantity: input.quantity,
        units,
        ...(input.initialLocationId ? { initialLocationId: input.initialLocationId } : {}),
      }),
    )
    .digest("hex");

  const existingBatch = await db.stockBatch.findUnique({
    where: { id: input.requestId },
  });

  if (existingBatch) {
    return replayBatch(existingBatch, actorId, requestHash);
  }

  try {
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
        data: units.map((unit) => ({
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

      await tx.auditEvent.createMany({
        data: createdUnits.map((unit) => ({
          actorId,
          action: "STOCK_UNIT_CREATED",
          entityType: "ITEM_UNIT",
          entityId: unit.id,
          newValues: {
            itemId: unit.itemId,
            stockBatchId: batch.id,
            unitNumber: unit.unitNumber,
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

      return batchResult(batch, false);
    });
  } catch (error) {
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
