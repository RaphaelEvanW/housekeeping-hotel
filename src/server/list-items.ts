import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { catalogPhotoSelect, itemPhotoUrls } from "@/server/item-catalog-view";
import {
  listItemsInputSchema,
  type ListItemsInput,
} from "@/server/list-items-input";

export async function listItems(input: ListItemsInput) {
  const { page, pageSize, q } = listItemsInputSchema.parse({
    page: String(input.page),
    pageSize: String(input.pageSize),
    q: input.q,
  });

  const search = q.replace(/[\\%_]/gu, "\\$&");

  const where: Prisma.ItemWhereInput = q
    ? {
        normalizedName: {
          contains: search,
        },
      }
    : {};

  const [items, total] = await db.$transaction(
    [
      db.item.findMany({
        where,
        orderBy: [
          { isActive: "desc" },
          { name: "asc" },
          { id: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      db.item.count({ where }),
    ],
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );

  return {
    items: items.map(({ photoKey, photos, ...item }) => ({ ...item, photoUrl: photoKey ? `/api/items/${item.id}/photo` : null, photos: itemPhotoUrls(item.id, photos) })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
    },
  };
}
