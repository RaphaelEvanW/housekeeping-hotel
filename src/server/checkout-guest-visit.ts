import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  checkoutGuestVisitInputSchema,
  guestVisitIdSchema,
} from "@/server/guest-visit-input";
import { guestVisitSelect } from "@/server/guest-visits";

export class GuestVisitCheckoutError extends Error {
  constructor(
    public readonly code: "VISIT_NOT_FOUND" | "OUTSTANDING_BORROWINGS",
    message: string,
    public readonly outstandingLines?: number,
  ) {
    super(message);
    this.name = "GuestVisitCheckoutError";
  }
}

export async function checkoutGuestVisit(
  visitId: string,
  rawInput: unknown,
  actorId: string,
) {
  const id = guestVisitIdSchema.parse(visitId);
  const input = checkoutGuestVisitInputSchema.parse(rawInput);

  return db.$transaction(
    async (tx) => {
      // Issuance and returns hold FOR SHARE on this visit until their save finishes.
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "guest_visit" WHERE "id" = ${id} FOR UPDATE
    `;
      if (!locked) {
        throw new GuestVisitCheckoutError(
          "VISIT_NOT_FOUND",
          "Kunjungan tamu tidak ditemukan.",
        );
      }

      const visit = await tx.guestVisit.findUniqueOrThrow({
        where: { id },
        select: guestVisitSelect,
      });
      const outstandingLines = await tx.borrowingLine.count({
        where: { borrowing: { guestVisitId: id }, status: "OUTSTANDING" },
      });

      if (visit.status === "CHECKED_OUT") {
        return { visit, outstandingLines, alreadyCheckedOut: true };
      }

      if (outstandingLines > 0 && !input.acknowledgeOutstanding) {
        throw new GuestVisitCheckoutError(
          "OUTSTANDING_BORROWINGS",
          `Masih ada ${outstandingLines} unit yang belum dikembalikan. Konfirmasi untuk melanjutkan checkout.`,
          outstandingLines,
        );
      }

      const checkedOutAt = new Date();
      const updated = await tx.guestVisit.update({
        where: { id },
        data: { status: "CHECKED_OUT", checkedOutAt, updatedById: actorId },
        select: guestVisitSelect,
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: "GUEST_VISIT_CHECKED_OUT",
          entityType: "GUEST_VISIT",
          entityId: id,
          oldValues: {
            status: visit.status,
            checkedOutAt: visit.checkedOutAt?.toISOString() ?? null,
          },
          newValues: {
            status: "CHECKED_OUT",
            checkedOutAt: checkedOutAt.toISOString(),
            outstandingLines,
            acknowledgedOutstanding: input.acknowledgeOutstanding,
          },
        },
      });

      return { visit: updated, outstandingLines, alreadyCheckedOut: false };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 10_000,
    },
  );
}
