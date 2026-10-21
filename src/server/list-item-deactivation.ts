import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { listItemDeactivationsInputSchema } from "@/server/item-deactivation-input";

export async function listItemDeactivationRequests(rawInput: unknown) {
  const { page, pageSize, status, itemId } =
    listItemDeactivationsInputSchema.parse(rawInput);

  const where: Prisma.ItemDeactivationRequestWhereInput = {
    ...(status === "ALL" ? {} : { status }),
    ...(itemId ? { itemId } : {}),
  };

  const [deactivationRequests, total] = await db.$transaction(
    [
      db.itemDeactivationRequest.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          reason: true,
          createdAt: true,
          decidedAt: true,
          item: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
          requestedBy: {
            select: {
              id: true,
              name: true,
            },
          },
          decidedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      db.itemDeactivationRequest.count({ where }),
    ],
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );

  return {
    deactivationRequests,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
    },
  };
}