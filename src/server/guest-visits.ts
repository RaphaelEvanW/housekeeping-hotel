import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { registerGuestVisitInputSchema } from "@/server/guest-visit-input";

export class GuestVisitRegistrationError extends Error {
  constructor(
    public readonly code: "REQUEST_CONFLICT" | "POSSIBLE_DUPLICATE",
    message: string,
    public readonly matchingVisitId?: string,
  ) {
    super(message);
  }
}

export const guestVisitSelect = {
  id: true,
  primaryGuestName: true,
  roomNumber: true,
  bookingNumber: true,
  checkInDate: true,
  plannedCheckoutDate: true,
  status: true,
  checkedOutAt: true,
  isDuplicate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GuestVisitSelect;

export async function registerGuestVisit(rawInput: unknown, actorId: string) {
  const input = registerGuestVisitInputSchema.parse(rawInput);
  const normalizedName = input.primaryGuestName.toLowerCase();
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        primaryGuestName: input.primaryGuestName,
        roomNumber: input.roomNumber,
        bookingNumber: input.bookingNumber,
        checkInDate: input.checkInDate,
        plannedCheckoutDate: input.plannedCheckoutDate,
        duplicateOverrideReason: input.duplicateOverrideReason ?? null,
      }),
    )
    .digest("hex");

  async function replay(client: Prisma.TransactionClient) {
    const existing = await client.guestVisit.findUnique({
      where: { id: input.requestId },
      select: {
        ...guestVisitSelect,
        createdById: true,
        registrationRequestHash: true,
      },
    });
    if (!existing) return null;
    const { createdById, registrationRequestHash, ...visit } = existing;
    if (createdById !== actorId || registrationRequestHash !== requestHash) {
      throw new GuestVisitRegistrationError(
        "REQUEST_CONFLICT",
        "ID registrasi sudah digunakan untuk permintaan lain.",
      );
    }
    return { visit, replayed: true };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const lockKey = JSON.stringify([
          "guest-visit-registration",
          normalizedName,
        ]);
        // Serialize matching registrations even when no visit row exists yet.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
        const existing = await replay(tx);
        if (existing) return existing;

        const checkInDate = new Date(`${input.checkInDate}T00:00:00.000Z`);
        const plannedCheckoutDate = new Date(
          `${input.plannedCheckoutDate}T00:00:00.000Z`,
        );
        const [suspected] = await tx.$queryRaw<
          { id: string; exact: boolean }[]
        >`
        SELECT "id", ("checkInDate" = ${input.checkInDate}::date AND "plannedCheckoutDate" = ${input.plannedCheckoutDate}::date) AS "exact"
        FROM "guest_visit"
        WHERE "status" = 'STAYING'
          AND "normalizedPrimaryGuestName" = ${normalizedName}
          AND lower("roomNumber") = lower(${input.roomNumber})
          AND "checkInDate" <= ${input.plannedCheckoutDate}::date
          AND "plannedCheckoutDate" >= ${input.checkInDate}::date
        ORDER BY "exact" DESC, "createdAt" ASC, "id" ASC
        LIMIT 1
      `;
        if (suspected && !input.duplicateOverrideReason) {
          throw new GuestVisitRegistrationError(
            "POSSIBLE_DUPLICATE",
            "Ada kunjungan aktif dengan nama, kamar, dan tanggal yang bertumpang tindih. Periksa atau isi alasan untuk melanjutkan.",
            suspected.id,
          );
        }
        const exact = suspected?.exact ? suspected : null;

        const visit = await tx.guestVisit.create({
          data: {
            id: input.requestId,
            primaryGuestName: input.primaryGuestName,
            normalizedPrimaryGuestName: normalizedName,
            roomNumber: input.roomNumber,
            bookingNumber: input.bookingNumber,
            registrationRequestHash: requestHash,
            checkInDate,
            plannedCheckoutDate,
            status: "STAYING",
            isDuplicate: Boolean(exact),
            createdById: actorId,
            updatedById: actorId,
          },
          select: guestVisitSelect,
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: "GUEST_VISIT_REGISTERED",
            entityType: "GUEST_VISIT",
            entityId: visit.id,
            reason: input.duplicateOverrideReason ?? null,
            newValues: {
              primaryGuestName: visit.primaryGuestName,
              roomNumber: visit.roomNumber,
              bookingNumber: visit.bookingNumber,
              checkInDate: input.checkInDate,
              plannedCheckoutDate: input.plannedCheckoutDate,
              status: visit.status,
              isDuplicate: visit.isDuplicate,
              possibleDuplicateVisitId: suspected?.id ?? null,
              exactDuplicateVisitId: exact?.id ?? null,
            },
          },
        });
        return { visit, replayed: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const committed = await replay(db);
      if (committed) return committed;
    }
    throw error;
  }
}
