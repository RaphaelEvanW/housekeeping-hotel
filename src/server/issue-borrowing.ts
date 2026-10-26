import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type ItemUnit } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { issueBorrowingInputSchema } from "@/server/issue-borrowing-input";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

type ErrorCode =
  | "REQUEST_CONFLICT"
  | "VISIT_NOT_FOUND"
  | "VISIT_NOT_STAYING"
  | "ITEM_INACTIVE"
  | "UNITS_UNAVAILABLE"
  | "PHOTOS_REQUIRED"
  | "LOCATION_UNAVAILABLE"
  | "RETRY_REQUIRED";

export class IssueBorrowingError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IssueBorrowingError";
  }
}

const borrowingSelect = {
  id: true,
  guestVisitId: true,
  primaryGuestNameSnapshot: true,
  roomNumberSnapshot: true,
  issuedAt: true,
  lines: {
    select: { id: true, unitId: true },
    orderBy: { unitId: "asc" },
  },
} satisfies Prisma.BorrowingSelect;

type LockedUnit = Pick<
  ItemUnit,
  | "id"
  | "itemId"
  | "condition"
  | "lifecycle"
  | "custody"
  | "readiness"
  | "lossState"
  | "locationId"
>;

async function findReplay(
  client: Prisma.TransactionClient,
  requestId: string,
  actorId: string,
  hash: string,
) {
  const existing = await client.borrowing.findUnique({
    where: { id: requestId },
    select: {
      ...borrowingSelect,
      issuedById: true,
      requestHash: true,
    },
  });

  if (!existing) return null;

  const { issuedById, requestHash, ...borrowing } = existing;

  if (issuedById !== actorId || requestHash !== hash) {
    throw new IssueBorrowingError(
      "REQUEST_CONFLICT",
      "ID request sudah digunakan untuk permintaan lain.",
    );
  }

  return { borrowing, replayed: true };
}

export async function issueBorrowing(
  rawInput: unknown,
  actorId: string,
  photos: File[][] = [],
) {
  const input = issueBorrowingInputSchema.parse(rawInput);

  if (
    photos.length !== input.unitIds.length ||
    photos.some((files) => !Array.isArray(files) || files.length === 0)
  ) {
    throw new IssueBorrowingError(
      "PHOTOS_REQUIRED",
      "Setiap unit wajib memiliki foto saat dipinjamkan.",
    );
  }

  const photoHashes: string[][] = [];

  for (const files of photos) {
    const hashes: string[] = [];

    for (const file of files) {
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > MAX_PHOTO_BYTES
      ) {
        throw new InvalidUnitPhotoError(
          "Setiap foto harus berukuran 1 byte sampai 2 MiB.",
        );
      }

      hashes.push(
        createHash("sha256")
          .update(Buffer.from(await file.arrayBuffer()))
          .digest("hex"),
      );
    }

    photoHashes.push(hashes);
  }

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        guestVisitId: input.guestVisitId,
        unitIds: input.unitIds,
        photoHashes,
      }),
    )
    .digest("hex");

  const existing = await findReplay(db, input.requestId, actorId, requestHash);

  if (existing) return existing;

  const storedKeys: string[] = [];
  const keysByUnit = new Map<string, string[]>();
  let transactionStarted = false;

  try {
    for (const [index, files] of photos.entries()) {
      const keys: string[] = [];

      for (const file of files) {
        const key = await storeUnitPhoto(await prepareUnitPhoto(file));
        storedKeys.push(key);
        keys.push(key);
      }

      keysByUnit.set(input.unitIds[index], keys);
    }

    transactionStarted = true;

    const result = await db.$transaction(
      async (tx) => {
        const lockKey = `borrowing:${input.requestId}`;

        await tx.$queryRaw`
        SELECT 1 AS locked
        FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

        const replay = await findReplay(
          tx,
          input.requestId,
          actorId,
          requestHash,
        );

        if (replay) return replay;

        const [visit] = await tx.$queryRaw<
          {
            id: string;
            primaryGuestName: string;
            roomNumber: string;
            status: string;
          }[]
        >`
        SELECT "id", "primaryGuestName", "roomNumber", "status"
        FROM "guest_visit"
        WHERE "id" = ${input.guestVisitId}
        FOR SHARE
      `;

        if (!visit) {
          throw new IssueBorrowingError(
            "VISIT_NOT_FOUND",
            "Kunjungan tamu tidak ditemukan.",
          );
        }

        if (visit.status !== "STAYING") {
          throw new IssueBorrowingError(
            "VISIT_NOT_STAYING",
            "Tamu yang sudah check-out tidak dapat membuat peminjaman baru.",
          );
        }

        const units = await tx.$queryRaw<LockedUnit[]>`
        SELECT
          "id", "itemId", "condition", "lifecycle", "custody",
          "readiness", "lossState", "locationId"
        FROM "item_unit"
        WHERE "id" IN (${Prisma.join(input.unitIds)})
        ORDER BY "id"
        FOR UPDATE
      `;

        if (
          units.length !== input.unitIds.length ||
          units.some(
            (unit) =>
              unit.lifecycle !== "ACTIVE" ||
              unit.custody !== "HOUSEKEEPING" ||
              unit.readiness !== "CLEAR" ||
              unit.lossState !== "NONE",
          )
        ) {
          throw new IssueBorrowingError(
            "UNITS_UNAVAILABLE",
            "Sebagian unit tidak tersedia untuk dipinjamkan.",
          );
        }

        const itemIds = [...new Set(units.map((unit) => unit.itemId))];

        const items = await tx.$queryRaw<
          {
            id: string;
            isActive: boolean;
          }[]
        >`
        SELECT "id", "isActive"
        FROM "item"
        WHERE "id" IN (${Prisma.join(itemIds)})
        ORDER BY "id"
        FOR SHARE
      `;

        if (
          items.length !== itemIds.length ||
          items.some((item) => !item.isActive)
        ) {
          throw new IssueBorrowingError(
            "ITEM_INACTIVE",
            "Jenis barang nonaktif tidak dapat dipinjamkan.",
          );
        }

        const outstanding = await tx.borrowingLine.findFirst({
          where: {
            unitId: { in: input.unitIds },
            status: "OUTSTANDING",
          },
          select: { id: true },
        });

        if (outstanding) {
          throw new IssueBorrowingError(
            "UNITS_UNAVAILABLE",
            "Sebagian unit masih memiliki peminjaman yang belum selesai.",
          );
        }

        const [destination] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"
        FROM "location"
        WHERE "code" = 'WITH_GUEST' AND "isActive" = true
        FOR SHARE
      `;

        if (!destination) {
          throw new IssueBorrowingError(
            "LOCATION_UNAVAILABLE",
            "Lokasi Bersama tamu belum tersedia atau nonaktif.",
          );
        }

        const borrowing = await tx.borrowing.create({
          data: {
            id: input.requestId,
            guestVisitId: visit.id,
            requestHash,
            primaryGuestNameSnapshot: visit.primaryGuestName,
            roomNumberSnapshot: visit.roomNumber,
            issuedById: actorId,
            lines: {
              create: units.map((unit) => ({
                unitId: unit.id,
                conditionAtIssue: unit.condition,
              })),
            },
          },
          select: borrowingSelect,
        });

        await tx.itemUnit.updateMany({
          where: { id: { in: input.unitIds } },
          data: {
            custody: "GUEST",
            locationId: destination.id,
            updatedById: actorId,
          },
        });

        const lineByUnit = new Map(
          borrowing.lines.map((line) => [line.unitId, line.id]),
        );

        const events = await tx.auditEvent.createManyAndReturn({
          data: units.map((unit) => ({
            actorId,
            action: "BORROWING_ISSUED",
            entityType: "ITEM_UNIT",
            entityId: unit.id,
            oldValues: {
              custody: unit.custody,
              locationId: unit.locationId,
            },
            newValues: {
              custody: "GUEST",
              locationId: destination.id,
              conditionAtIssue: unit.condition,
              borrowingId: borrowing.id,
              borrowingLineId: lineByUnit.get(unit.id),
              guestVisitId: visit.id,
              primaryGuestNameSnapshot: visit.primaryGuestName,
              roomNumberSnapshot: visit.roomNumber,
            },
          })),
          select: { id: true, entityId: true },
        });

        await tx.itemUnitPhoto.createMany({
          data: events.flatMap((event) => {
            const lineId = lineByUnit.get(event.entityId);
            const keys = keysByUnit.get(event.entityId);

            if (!lineId || !keys?.length) {
              throw new IssueBorrowingError(
                "PHOTOS_REQUIRED",
                "Referensi foto peminjaman tidak lengkap.",
              );
            }

            return keys.map((photoKey) => ({
              unitId: event.entityId,
              auditEventId: event.id,
              borrowingLineId: lineId,
              photoKey,
            }));
          }),
        });

        await tx.auditEvent.create({
          data: {
            actorId,
            action: "BORROWING_CREATED",
            entityType: "BORROWING",
            entityId: borrowing.id,
            newValues: {
              guestVisitId: visit.id,
              unitIds: input.unitIds,
              primaryGuestNameSnapshot: visit.primaryGuestName,
              roomNumberSnapshot: visit.roomNumber,
            },
          },
        });

        return { borrowing, replayed: false };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000,
      },
    );

    if (result.replayed) {
      await Promise.allSettled(storedKeys.map((key) => removeUnitPhoto(key)));
    }

    return result;
  } catch (error) {
    const knownRollback =
      error instanceof IssueBorrowingError ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2003", "P2034"].includes(error.code));

    // Preserve evidence when the COMMIT outcome is unknown.
    if (!transactionStarted || knownRollback) {
      await Promise.allSettled(storedKeys.map((key) => removeUnitPhoto(key)));
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const replay = await findReplay(
          db,
          input.requestId,
          actorId,
          requestHash,
        );

        if (replay) return replay;

        const target = error.meta?.target;
        const names = Array.isArray(target) ? target : [target];

        if (
          names.some(
            (name) =>
              String(name) === "unitId" ||
              String(name).includes("one_outstanding_per_unit"),
          )
        ) {
          throw new IssueBorrowingError(
            "UNITS_UNAVAILABLE",
            "Sebagian unit sudah dipinjamkan oleh request lain.",
          );
        }
      }

      if (error.code === "P2034") {
        throw new IssueBorrowingError(
          "RETRY_REQUIRED",
          "Data sedang berubah. Ulangi dengan ID request dan foto yang sama.",
        );
      }
    }

    throw error;
  }
}
