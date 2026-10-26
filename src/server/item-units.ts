import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { updateItemUnitInputSchema } from "@/server/item-unit-input";
import { catalogPhotoSelect, itemPhotoUrls } from "@/server/item-catalog-view";

const PAGE_SIZE = 50;

export async function getItemUnits(
  itemId: string,
  after?: number,
  borrowableOnly = false,
) {
  const unitWhere: Prisma.ItemUnitWhereInput = {
    ...(after === undefined
      ? {}
      : {
          unitNumber: { gt: after },
        }),
    ...(borrowableOnly
      ? {
          item: { isActive: true },
          lifecycle: "ACTIVE",
          custody: "HOUSEKEEPING",
          readiness: "CLEAR",
          lossState: "NONE",
          borrowingLines: {
            none: { status: "OUTSTANDING" },
          },
        }
      : {}),
  };

  return db.$transaction(
    async (tx) => {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          isActive: true,
          description: true,
          photoKey: true,
          photos: { select: catalogPhotoSelect, orderBy: { position: "asc" } },
          _count: {
            select: {
              units: true,
            },
          },
          units: {
            where: unitWhere,
            orderBy: {
              unitNumber: "asc",
            },
            take: PAGE_SIZE + 1,
            select: {
              id: true,
              unitNumber: true,
              name: true,
              serialNumber: true,
              notes: true,
              lifecycle: true,
              custody: true,
              condition: true,
              readiness: true,
              lossState: true,
              createdAt: true,
              updatedAt: true,
              location: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!item) {
        return null;
      }

      const hasMore = item.units.length > PAGE_SIZE;
      const pageUnits = item.units.slice(0, PAGE_SIZE);
      const lastUnit = pageUnits.at(-1);

      return {
        item: {
          id: item.id,
          name: item.name,
          isActive: item.isActive,
          description: item.description,
          photoUrl: item.photoKey ? `/api/items/${item.id}/photo` : null,
          photos: itemPhotoUrls(item.id, item.photos),
        },
        totalRegistered: item._count.units,
        units: pageUnits.map((unit) => ({
          ...unit,
          unitCode: `HK-${String(unit.unitNumber).padStart(6, "0")}`,
        })),
        nextCursor: hasMore && lastUnit ? lastUnit.unitNumber : null,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );
}

export class ItemUnitNotFoundError extends Error {
  constructor() {
    super("Unit barang tidak ditemukan.");
    this.name = "ItemUnitNotFoundError";
  }
}

export async function updateItemUnitDetails(
  unitId: string,
  rawInput: unknown,
  actorId: string,
) {
  const input = updateItemUnitInputSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const lockedUnits = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "item_unit"
      WHERE "id" = ${unitId}
      FOR UPDATE
    `;

    if (lockedUnits.length === 0) {
      throw new ItemUnitNotFoundError();
    }

    const before = await tx.itemUnit.findUniqueOrThrow({
      where: { id: unitId },
    });

    const name = input.name === undefined ? before.name : input.name;

    const serialNumber =
      input.serialNumber === undefined
        ? before.serialNumber
        : input.serialNumber;

    const notes = input.notes === undefined ? before.notes : input.notes;

    if (
      name === before.name &&
      serialNumber === before.serialNumber &&
      notes === before.notes
    ) {
      return before;
    }

    const unit = await tx.itemUnit.update({
      where: { id: unitId },
      data: {
        name,
        serialNumber,
        notes,
        updatedById: actorId,
      },
    });

    await tx.auditEvent.create({
      data: {
        actorId,
        action: "ITEM_UNIT_DETAILS_UPDATED",
        entityType: "ITEM_UNIT",
        entityId: unit.id,
        oldValues: {
          name: before.name,
          serialNumber: before.serialNumber,
          notes: before.notes,
        },
        newValues: {
          name: unit.name,
          serialNumber: unit.serialNumber,
          notes: unit.notes,
        },
      },
    });

    return unit;
  });
}
