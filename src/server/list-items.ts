import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
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
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
    },
  };
}