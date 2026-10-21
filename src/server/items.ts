import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { itemNameSchema } from "@/server/item-input";
import { db } from "@/server/db";

export class DuplicateItemNameError extends Error {
  constructor() {
    super("Jenis barang dengan nama tersebut sudah ada.");
    this.name = "DuplicateItemNameError";
  }
}

export function prepareItemName(input: string) {
  const name = itemNameSchema.parse(input);

  return {
    name,
    normalizedName: name.toLowerCase(),
  };
}

export async function createItem(name: string, actorId: string) {
  const preparedName = prepareItemName(name);

  try {
    return await db.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          ...preparedName,
          createdById: actorId,
          updatedById: actorId,
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId,
          action: "ITEM_CREATED",
          entityType: "ITEM",
          entityId: item.id,
          newValues: {
            name: item.name,
            normalizedName: preparedName.normalizedName,
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

export class ItemNotFoundError extends Error {
  constructor() {
    super("Jenis barang tidak ditemukan.");
    this.name = "ItemNotFoundError";
  }
}

export async function updateItemName(
  itemId: string,
  name: string,
  actorId: string,
) {
  const preparedName = prepareItemName(name);

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
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (
        before.name === preparedName.name &&
        before.normalizedName === preparedName.normalizedName
      ) {
        return {
          id: before.id,
          name: before.name,
          isActive: before.isActive,
          createdAt: before.createdAt,
          updatedAt: before.updatedAt,
        };
      }

      const item = await tx.item.update({
        where: { id: itemId },
        data: {
          ...preparedName,
          updatedById: actorId,
        },
        select: {
          id: true,
          name: true,
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
          },
          newValues: {
            name: item.name,
            normalizedName: preparedName.normalizedName,
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