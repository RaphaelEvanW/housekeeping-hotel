import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  guestVisitIdSchema,
  updateGuestVisitInputSchema,
} from "@/server/guest-visit-input";
import {
  findOverlappingGuestVisit,
  guestVisitSelect,
  lockGuestVisitRoom,
} from "@/server/guest-visits";

export class GuestVisitUpdateError extends Error {
  constructor(
    public readonly code:
      | "VISIT_NOT_FOUND"
      | "VISIT_CHANGED"
      | "POSSIBLE_DUPLICATE",
    message: string,
    public readonly matchingVisitId?: string,
  ) {
    super(message);
    this.name = "GuestVisitUpdateError";
  }
}

export async function updateGuestVisit(
  visitId: string,
  rawInput: unknown,
  actorId: string,
) {
  const id = guestVisitIdSchema.parse(visitId);
  const input = updateGuestVisitInputSchema.parse(rawInput);

  return db.$transaction(
    async (tx) => {
      const initial = await tx.guestVisit.findUnique({
        where: { id },
        select: { roomNumber: true },
      });
      if (!initial) {
        throw new GuestVisitUpdateError(
          "VISIT_NOT_FOUND",
          "Kunjungan tamu tidak ditemukan.",
        );
      }

      await lockGuestVisitRoom(tx, input.roomNumber ?? initial.roomNumber);

      const [lockedVisit] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "guest_visit" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!lockedVisit) {
        throw new GuestVisitUpdateError(
          "VISIT_NOT_FOUND",
          "Kunjungan tamu tidak ditemukan.",
        );
      }

      const current = await tx.guestVisit.findUniqueOrThrow({
        where: { id },
        select: guestVisitSelect,
      });
      if (
        current.updatedAt.getTime() !==
        new Date(input.expectedUpdatedAt).getTime() ||
        (input.roomNumber === undefined && current.roomNumber !== initial.roomNumber)
      ) {
        throw new GuestVisitUpdateError(
          "VISIT_CHANGED",
          "Data kunjungan sudah berubah. Muat ulang sebelum menyimpan.",
        );
      }

      const primaryGuestName =
        input.primaryGuestName ?? current.primaryGuestName;
      const roomNumber = input.roomNumber ?? current.roomNumber;
      if (
        primaryGuestName === current.primaryGuestName &&
        roomNumber === current.roomNumber
      ) {
        return { visit: current, unchanged: true };
      }

      const suspected =
        current.status === "STAYING"
          ? await findOverlappingGuestVisit(tx, {
              roomNumber,
              checkInDate: current.checkInDate.toISOString().slice(0, 10),
              plannedCheckoutDate: current.plannedCheckoutDate
                .toISOString()
                .slice(0, 10),
              excludeVisitId: id,
            })
          : null;
      if (suspected) {
        throw new GuestVisitUpdateError(
          "POSSIBLE_DUPLICATE",
          "Kamar sudah terdaftar pada kunjungan aktif dengan rentang menginap yang bertumpang tindih.",
          suspected.id,
        );
      }

      const updatedAt = new Date(
        Math.max(Date.now(), current.updatedAt.getTime() + 1),
      );
      const visit = await tx.guestVisit.update({
        where: { id },
        data: {
          primaryGuestName,
          normalizedPrimaryGuestName: primaryGuestName.toLowerCase(),
          roomNumber,
          updatedById: actorId,
          updatedAt,
        },
        select: guestVisitSelect,
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "GUEST_VISIT_UPDATED",
          entityType: "GUEST_VISIT",
          entityId: id,
          reason: input.reason,
          oldValues: {
            primaryGuestName: current.primaryGuestName,
            roomNumber: current.roomNumber,
          },
          newValues: {
            primaryGuestName: visit.primaryGuestName,
            roomNumber: visit.roomNumber,
          },
        },
      });

      return { visit, unchanged: false };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}
