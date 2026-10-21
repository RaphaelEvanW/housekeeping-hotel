import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

import {
  decideItemDeactivationSchema,
  requestItemDeactivationSchema,
} from "@/server/item-deactivation-input";

type ItemDeactivationErrorCode =
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "PENDING_REQUEST_EXISTS"
  | "REQUEST_NOT_FOUND"
  | "REQUEST_NOT_PENDING"
  | "REQUEST_NOT_OWNER";

export class ItemDeactivationError extends Error {
  constructor(
    public readonly code: ItemDeactivationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ItemDeactivationError";
  }
}

export async function requestItemDeactivation(
  itemId: string,
  rawInput: unknown,
  actorId: string,
) {
  const input = requestItemDeactivationSchema.parse(rawInput);

  try {
    return await db.$transaction(async (tx) => {
      const [item] = await tx.$queryRaw<
        { id: string; isActive: boolean }[]
      >`
        SELECT "id", "isActive"
        FROM "item"
        WHERE "id" = ${itemId}
        FOR UPDATE
      `;

      if (!item) {
        throw new ItemDeactivationError(
          "ITEM_NOT_FOUND",
          "Jenis barang tidak ditemukan.",
        );
      }

      if (!item.isActive) {
        throw new ItemDeactivationError(
          "ITEM_INACTIVE",
          "Jenis barang sudah nonaktif.",
        );
      }

      const pending = await tx.itemDeactivationRequest.findFirst({
        where: {
          itemId,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (pending) {
        throw new ItemDeactivationError(
          "PENDING_REQUEST_EXISTS",
          "Jenis barang masih memiliki pengajuan yang menunggu keputusan.",
        );
      }

      const request = await tx.itemDeactivationRequest.create({
        data: {
          itemId,
          reason: input.reason,
          requestedById: actorId,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId,
          action: "ITEM_DEACTIVATION_REQUESTED",
          entityType: "ITEM_DEACTIVATION_REQUEST",
          entityId: request.id,
          reason: input.reason,
          newValues: {
            itemId,
            status: request.status,
            requestedById: actorId,
          },
        },
      });

      return request;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ItemDeactivationError(
        "PENDING_REQUEST_EXISTS",
        "Pengajuan pending untuk jenis barang ini sudah ada.",
      );
    }

    throw error;
  }
}

export async function decideItemDeactivation(
  requestId: string,
  rawInput: unknown,
  actorId: string,
) {
  const input = decideItemDeactivationSchema.parse(rawInput);
  const status =
    input.decision === "APPROVE" ? "APPROVED" : "REJECTED";

  return db.$transaction(async (tx) => {
    const existing = await tx.itemDeactivationRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      throw new ItemDeactivationError(
        "REQUEST_NOT_FOUND",
        "Pengajuan tidak ditemukan.",
      );
    }

    const [item] = await tx.$queryRaw<
      { id: string; isActive: boolean }[]
    >`
      SELECT "id", "isActive"
      FROM "item"
      WHERE "id" = ${existing.itemId}
      FOR UPDATE
    `;

    if (!item) {
      throw new ItemDeactivationError(
        "ITEM_NOT_FOUND",
        "Jenis barang tidak ditemukan.",
      );
    }

    if (status === "APPROVED" && !item.isActive) {
      throw new ItemDeactivationError(
        "ITEM_INACTIVE",
        "Jenis barang sudah nonaktif.",
      );
    }

    const changed = await tx.itemDeactivationRequest.updateMany({
      where: {
        id: requestId,
        status: "PENDING",
      },
      data: {
        status,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });

    if (changed.count !== 1) {
      throw new ItemDeactivationError(
        "REQUEST_NOT_PENDING",
        "Pengajuan sudah diputuskan atau dibatalkan.",
      );
    }

    if (status === "APPROVED") {
      await tx.item.update({
        where: { id: item.id },
        data: {
          isActive: false,
          updatedById: actorId,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId,
          action: "ITEM_DEACTIVATED",
          entityType: "ITEM",
          entityId: item.id,
          reason: existing.reason,
          oldValues: { isActive: true },
          newValues: {
            isActive: false,
            deactivationRequestId: requestId,
          },
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        actorId,
        action: `ITEM_DEACTIVATION_${status}`,
        entityType: "ITEM_DEACTIVATION_REQUEST",
        entityId: requestId,
        reason: existing.reason,
        oldValues: { status: "PENDING" },
        newValues: {
          status,
          itemId: item.id,
          decidedById: actorId,
        },
      },
    });

    return tx.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
  });
}

export async function cancelItemDeactivation(
  requestId: string,
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.itemDeactivationRequest.findUnique({
      where: { id: requestId },
    });

    if (!existing) {
      throw new ItemDeactivationError(
        "REQUEST_NOT_FOUND",
        "Pengajuan tidak ditemukan.",
      );
    }

    if (existing.requestedById !== actorId) {
      throw new ItemDeactivationError(
        "REQUEST_NOT_OWNER",
        "Hanya pengaju yang boleh membatalkan pengajuan ini.",
      );
    }

    const lockedItems = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "item"
      WHERE "id" = ${existing.itemId}
      FOR UPDATE
    `;

    if (lockedItems.length === 0) {
      throw new ItemDeactivationError(
        "ITEM_NOT_FOUND",
        "Jenis barang tidak ditemukan.",
      );
    }

    const changed = await tx.itemDeactivationRequest.updateMany({
      where: {
        id: requestId,
        requestedById: actorId,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });

    if (changed.count !== 1) {
      throw new ItemDeactivationError(
        "REQUEST_NOT_PENDING",
        "Pengajuan sudah diputuskan atau dibatalkan.",
      );
    }

    await tx.auditEvent.create({
      data: {
        actorId,
        action: "ITEM_DEACTIVATION_CANCELLED",
        entityType: "ITEM_DEACTIVATION_REQUEST",
        entityId: requestId,
        reason: existing.reason,
        oldValues: { status: "PENDING" },
        newValues: {
          status: "CANCELLED",
          itemId: existing.itemId,
          decidedById: actorId,
        },
      },
    });

    return tx.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
  });
}