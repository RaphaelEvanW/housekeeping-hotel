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

export async function lockGuestVisitRoom(
  tx: Prisma.TransactionClient,
  roomNumber: string,
) {
  // Use the same database case folding as the room comparison below.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('guest-visit-room:' || lower(${roomNumber}), 0))`;
}

export async function findOverlappingGuestVisit(
  tx: Prisma.TransactionClient,
  input: {
    roomNumber: string;
    checkInDate: string;
    plannedCheckoutDate: string;
    excludeVisitId?: string;
  },
) {
  // Checkout is exclusive; a same-day stay has no overnight occupancy interval.
  if (input.checkInDate === input.plannedCheckoutDate) return null;
  const excludedId =
    input.excludeVisitId ?? "00000000-0000-0000-0000-000000000000";
  const [match] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "guest_visit"
    WHERE "status" = 'STAYING'
      AND "id" <> ${excludedId}
      AND lower("roomNumber") = lower(${input.roomNumber})
      AND "checkInDate" < "plannedCheckoutDate"
      AND "checkInDate" < ${input.plannedCheckoutDate}::date
      AND "plannedCheckoutDate" > ${input.checkInDate}::date
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1
  `;
  return match ?? null;
}

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
        // Preserve fingerprints of existing registrations without an override.
        duplicateOverrideReason: null,
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
        await lockGuestVisitRoom(tx, input.roomNumber);
        const existing = await replay(tx);
        if (existing) return existing;

        const checkInDate = new Date(`${input.checkInDate}T00:00:00.000Z`);
        const plannedCheckoutDate = new Date(
          `${input.plannedCheckoutDate}T00:00:00.000Z`,
        );
        const suspected = await findOverlappingGuestVisit(tx, {
          roomNumber: input.roomNumber,
          checkInDate: input.checkInDate,
          plannedCheckoutDate: input.plannedCheckoutDate,
        });
        if (suspected) {
          throw new GuestVisitRegistrationError(
            "POSSIBLE_DUPLICATE",
            "Kamar sudah terdaftar pada kunjungan aktif dengan rentang menginap yang bertumpang tindih.",
            suspected.id,
          );
        }

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
            isDuplicate: false,
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
            newValues: {
              primaryGuestName: visit.primaryGuestName,
              roomNumber: visit.roomNumber,
              bookingNumber: visit.bookingNumber,
              checkInDate: input.checkInDate,
              plannedCheckoutDate: input.plannedCheckoutDate,
              status: visit.status,
              isDuplicate: visit.isDuplicate,
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
