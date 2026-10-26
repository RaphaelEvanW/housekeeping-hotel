import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  createItemInputSchema,
  itemNameSchema,
  updateItemInputSchema,
} from "@/server/item-input";
import { db } from "@/server/db";
import { InvalidItemPhotoError, MAX_CATALOG_PHOTOS, removeItemPhoto, storeItemPhoto } from "@/server/item-photo";
import { catalogPhotoSelect } from "@/server/item-catalog-view";
import { isItemNameConflict } from "@/server/item-name-conflict";

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

export async function createItem(name: string, actorId: string, details: { description?: string; photos?: Buffer[] } = {}) {
  const input = createItemInputSchema.parse({ name, description: details.description });
  const preparedName = prepareItemName(name);
  if ((details.photos?.length ?? 0) > MAX_CATALOG_PHOTOS) throw new InvalidItemPhotoError("Maksimal 10 foto katalog.");
  const photoKeys: string[] = [];
  let transactionStarted = false;
  let bodyFailed = false;

  try {
    for (const bytes of details.photos ?? []) photoKeys.push(await storeItemPhoto(bytes));
    const photoKey = photoKeys[0] ?? null;
    return await db.$transaction(async (tx) => {
      transactionStarted = true;
      try {
        const item = await tx.item.create({
          data: {
            ...preparedName,
            description: input.description || null,
            photoKey,
            photos: { create: photoKeys.map((key, position) => ({ photoKey: key, position })) },
            createdById: actorId,
            updatedById: actorId,
          },
          select: {
            id: true,
            name: true,
            isActive: true,
            description: true,
            photoKey: true,
            photos: { select: catalogPhotoSelect, orderBy: { position: "asc" } },
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
              photoKeys,
              photoIds: item.photos.map(photo => photo.id),
            },
          },
        });

        return item;
      } catch (error) {
        bodyFailed = true;
        throw error;
      }
    });
  } catch (error) {
    const knownRollback = bodyFailed || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code));
    // Keep evidence if COMMIT may have succeeded despite a lost response.
    if (!transactionStarted || knownRollback) {
      await Promise.allSettled(photoKeys.map(key => removeItemPhoto(key)));
    }
    if (isItemNameConflict(error)) {
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
    if (isItemNameConflict(error)) {
      throw new DuplicateItemNameError();
    }

    throw error;
  }
}
