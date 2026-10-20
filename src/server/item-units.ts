import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const PAGE_SIZE = 50;

export async function getItemUnits(
  itemId: string,
  after?: number,
) {
  return db.$transaction(
    async (tx) => {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          name: true,
          isActive: true,
          _count: {
            select: {
              units: true,
            },
          },
          units: {
            where:
              after === undefined
                ? {}
                : { unitNumber: { gt: after } },
            orderBy: {
              unitNumber: "asc",
            },
            take: PAGE_SIZE + 1,
            select: {
              id: true,
              unitNumber: true,
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
        },
        totalRegistered: item._count.units,
        units: pageUnits.map((unit) => ({
          ...unit,
          unitCode: `HK-${String(unit.unitNumber).padStart(6, "0")}`,
        })),
        nextCursor:
          hasMore && lastUnit ? lastUnit.unitNumber : null,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );
}