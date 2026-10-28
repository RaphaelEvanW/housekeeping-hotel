import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { itemUnitHistoryInputSchema } from "@/server/item-unit-input";

function visibleNewValues(
  action: string,
  values: Prisma.JsonValue | null,
) {
  if (
    ![
      "ITEM_UNIT_DAMAGE_REPORTED",
      "ITEM_UNIT_CONDITION_UPDATED",
      "ITEM_UNIT_SENT_TO_ENGINEERING",
      "ITEM_UNIT_RECEIVED_FROM_ENGINEERING",
    ].includes(action) ||
    !values ||
    typeof values !== "object" ||
    Array.isArray(values)
  ) {
    return values;
  }

  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key !== "requestHash"),
  ) as Prisma.JsonObject;
}

export async function getItemUnitHistory(rawInput: unknown) {
  const { unitId, page, pageSize } = itemUnitHistoryInputSchema.parse(rawInput);

  return db.$transaction(
    async (tx) => {
      const unit = await tx.itemUnit.findUnique({
        where: { id: unitId },
        select: {
          id: true,
          unitNumber: true,
          name: true,
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
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            action: true,
            reason: true,
            oldValues: true,
            newValues: true,
            createdAt: true,
            photos: {
              where: { unitId },
              orderBy: { id: "asc" },
              select: { id: true },
            },
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
          name: unit.name,
          unitCode: `HK-${String(unit.unitNumber).padStart(6, "0")}`,
          item: unit.item,
        },
        events: events.map((event) => ({
          ...event,
          newValues: visibleNewValues(event.action, event.newValues),
          photos: event.photos.map((photo) => ({
            id: photo.id,
            url: `/api/item-units/${unitId}/photos/${photo.id}`,
          })),
        })),
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
