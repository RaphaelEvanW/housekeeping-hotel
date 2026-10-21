import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { itemUnitHistoryInputSchema } from "@/server/item-unit-input";

export async function getItemUnitHistory(rawInput: unknown) {
  const { unitId, page, pageSize } =
    itemUnitHistoryInputSchema.parse(rawInput);

  return db.$transaction(
    async (tx) => {
      const unit = await tx.itemUnit.findUnique({
        where: { id: unitId },
        select: {
          id: true,
          unitNumber: true,
          item: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      });

      if (!unit) {
        return null;
      }

      const where: Prisma.AuditEventWhereInput = {
        entityType: "ITEM_UNIT",
        entityId: unitId,
      };

      const [events, total] = await Promise.all([
        tx.auditEvent.findMany({
          where,
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            action: true,
            reason: true,
            oldValues: true,
            newValues: true,
            createdAt: true,
            actor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        tx.auditEvent.count({ where }),
      ]);

      return {
        unit: {
          id: unit.id,
          unitCode: `HK-${String(unit.unitNumber).padStart(6, "0")}`,
          item: unit.item,
        },
        events,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: page * pageSize < total,
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );
}