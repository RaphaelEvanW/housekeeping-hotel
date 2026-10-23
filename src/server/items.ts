import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  createItemInputSchema,
  itemNameSchema,
  updateItemInputSchema,
} from "@/server/item-input";
import { db } from "@/server/db";
import { removeItemPhoto, storeItemPhoto } from "@/server/item-photo";

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

export async function createItem(name: string, actorId: string, details: { description?: string; photo?: Buffer } = {}) {
  const input = createItemInputSchema.parse({ name, description: details.description });
  const preparedName = prepareItemName(name);
  const photoKey = details.photo ? await storeItemPhoto(details.photo) : null;

  try {
    return await db.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          ...preparedName,
          description: input.description || null,
          photoKey,
          createdById: actorId,
          updatedById: actorId,
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          description: true,
          photoKey: true,
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
            description: input.description || null,
            photoKey,
          },
        },
      });

      return item;
    });
  } catch (error) {
    if (photoKey) await removeItemPhoto(photoKey).catch(() => { console.error("Catalogue photo cleanup failed."); });
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
