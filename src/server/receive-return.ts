import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type ItemUnit } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { receiveReturnInputSchema } from "@/server/receive-return-input";
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
  | "LINES_UNAVAILABLE"
  | "UNIT_STATE_CONFLICT"
  | "LOCATION_UNAVAILABLE"
  | "INVALID_PHOTOS"
  | "PHOTOS_REQUIRED"
  | "RETRY_REQUIRED";

export class ReceiveReturnError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReceiveReturnError";
  }
}

const receiptSelect = {
  id: true,
  guestVisitId: true,
  defaultLocationId: true,
  receivedAt: true,
  receivedBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { borrowingLineId: "asc" },
    select: {
      id: true,
      borrowingLineId: true,
      condition: true,
      locationId: true,
      borrowingLine: {
        select: { unitId: true, borrowingId: true },
      },
    },
  },
} satisfies Prisma.ReturnBatchSelect;

type LockedUnit = Pick<
  ItemUnit,
  "id" | "custody" | "condition" | "readiness" | "lossState" | "locationId"
>;

async function findReplay(
  client: Prisma.TransactionClient | typeof db,
  requestId: string,
  actorId: string,
  requestHash: string,
) {
  const existing = await client.returnBatch.findUnique({
    where: { id: requestId },
    select: { ...receiptSelect, receivedById: true, requestHash: true },
  });

  if (!existing) return null;

  const { receivedById, requestHash: savedHash, ...receipt } = existing;
  if (receivedById !== actorId || savedHash !== requestHash) {
    throw new ReceiveReturnError(
      "REQUEST_CONFLICT",
      "ID request sudah digunakan untuk pengembalian lain.",
    );
  }

  return { receipt, replayed: true };
}

export async function receiveReturn(
  rawInput: unknown,
  actorId: string,
  submittedPhotos: File[][] = [],
) {
  const input = receiveReturnInputSchema.parse(rawInput);
  const photos = submittedPhotos.length === 0
    ? input.lines.map(() => [] as File[])
    : submittedPhotos;

  if (
    photos.length !== input.lines.length ||
    photos.some((files) => !Array.isArray(files))
  ) {
    throw new ReceiveReturnError(
      "INVALID_PHOTOS",
      "Kelompok foto pengembalian tidak sesuai dengan unit yang dipilih.",
    );
  }

  const normalizedLines = input.lines.map((line, index) => ({
    ...line,
    locationId: line.locationId ?? input.defaultLocationId,
    photoHashes: [] as string[],
    photos: photos[index],
  }));

  for (const line of normalizedLines) {
    if (line.condition !== "GOOD" && line.photos.length === 0) {
      throw new ReceiveReturnError(
        "PHOTOS_REQUIRED",
        "Setiap unit dengan kondisi selain baik wajib memiliki foto.",
      );
    }

    for (const file of line.photos) {
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > MAX_PHOTO_BYTES
      ) {
        throw new InvalidUnitPhotoError("Setiap foto harus berukuran 1 byte sampai 2 MiB.");
      }

      line.photoHashes.push(
        createHash("sha256")
          .update(Buffer.from(await file.arrayBuffer()))
          .digest("hex"),
      );
    }
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      guestVisitId: input.guestVisitId,
      defaultLocationId: input.defaultLocationId,
      lines: normalizedLines.map(({ borrowingLineId, condition, locationId, photoHashes }) => ({
        borrowingLineId,
        condition,
        locationId,
        photoHashes,
      })),
    }))
    .digest("hex");

  const existing = await findReplay(db, input.requestId, actorId, requestHash);
  if (existing) return existing;

  const storedKeys: string[] = [];
  const keysByLine = new Map<string, string[]>();
  let transactionStarted = false;
  let knownRollback = false;

  try {
    for (const line of normalizedLines) {
      const keys: string[] = [];
      for (const file of line.photos) {
        const key = await storeUnitPhoto(await prepareUnitPhoto(file));
        storedKeys.push(key);
        keys.push(key);
      }
      keysByLine.set(line.borrowingLineId, keys);
    }

    const result = await db.$transaction(
      async (tx) => {
        transactionStarted = true;
        try {
          const lockKey = `return:${input.requestId}`;
          await tx.$queryRaw`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
          `;

          const replay = await findReplay(tx, input.requestId, actorId, requestHash);
          if (replay) return replay;

          const [visit] = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "guest_visit" WHERE "id" = ${input.guestVisitId} FOR SHARE
          `;
          if (!visit) {
            throw new ReceiveReturnError("VISIT_NOT_FOUND", "Kunjungan tamu tidak ditemukan.");
          }

          const lineIds = input.lines.map((line) => line.borrowingLineId);
          const borrowingLines = await tx.borrowingLine.findMany({
            where: {
              id: { in: lineIds },
              borrowing: { guestVisitId: input.guestVisitId },
            },
            select: {
              id: true,
              unitId: true,
              borrowingId: true,
              borrowing: {
                select: {
                  primaryGuestNameSnapshot: true,
                  roomNumberSnapshot: true,
                },
              },
            },
          });

          const unitIds = [...new Set(borrowingLines.map((line) => line.unitId))];
          if (borrowingLines.length !== input.lines.length || unitIds.length !== input.lines.length) {
            throw new ReceiveReturnError(
              "LINES_UNAVAILABLE",
              "Sebagian unit bukan pinjaman aktif pada kunjungan ini.",
            );
          }

          const units = await tx.$queryRaw<LockedUnit[]>`
            SELECT "id", "custody", "condition", "readiness", "lossState", "locationId"
            FROM "item_unit"
            WHERE "id" IN (${Prisma.join(unitIds)})
            ORDER BY "id"
            FOR UPDATE
          `;

          const lockedLines = await tx.$queryRaw<{ id: string; status: string }[]>`
            SELECT "id", "status"
            FROM "borrowing_line"
            WHERE "id" IN (${Prisma.join(lineIds)})
            ORDER BY "id"
            FOR UPDATE
          `;
          if (
            units.length !== input.lines.length ||
            lockedLines.length !== input.lines.length ||
            lockedLines.some((line) => line.status !== "OUTSTANDING")
          ) {
            throw new ReceiveReturnError(
              "LINES_UNAVAILABLE",
              "Sebagian unit sudah dikembalikan atau tidak lagi memiliki pinjaman aktif.",
            );
          }

          if (units.some((unit) => unit.custody !== "GUEST" || unit.lossState !== "NONE")) {
            throw new ReceiveReturnError(
              "UNIT_STATE_CONFLICT",
              "Status penguasaan unit tidak sesuai untuk pengembalian biasa.",
            );
          }

          const locationIds = [...new Set([
            input.defaultLocationId,
            ...normalizedLines.map((line) => line.locationId),
          ])].sort();
          const locations = await tx.$queryRaw<{ id: string; code: string; isActive: boolean }[]>`
            SELECT "id", "code", "isActive"
            FROM "location"
            WHERE "id" IN (${Prisma.join(locationIds)})
            ORDER BY "id"
            FOR SHARE
          `;
          if (
            locations.length !== locationIds.length ||
            locations.some((location) => !location.isActive || location.code === "WITH_GUEST")
          ) {
            throw new ReceiveReturnError(
              "LOCATION_UNAVAILABLE",
              "Pilih lokasi penerimaan yang aktif dan bukan lokasi bersama tamu.",
            );
          }

          const receivedAt = new Date();
          const receipt = await tx.returnBatch.create({
            data: {
              id: input.requestId,
              guestVisitId: visit.id,
              requestHash,
              defaultLocationId: input.defaultLocationId,
              receivedById: actorId,
              receivedAt,
              lines: {
                create: normalizedLines.map((line) => ({
                  borrowingLineId: line.borrowingLineId,
                  condition: line.condition,
                  locationId: line.locationId,
                })),
              },
            },
            select: receiptSelect,
          });

          const updatedLines = await tx.borrowingLine.updateMany({
            where: { id: { in: lineIds }, status: "OUTSTANDING" },
            data: { status: "RETURNED", resolvedAt: receivedAt },
          });
          if (updatedLines.count !== input.lines.length) {
            throw new ReceiveReturnError(
              "LINES_UNAVAILABLE",
              "Sebagian unit sudah dikembalikan oleh proses lain.",
            );
          }

          const lineById = new Map(borrowingLines.map((line) => [line.id, line]));
          const unitById = new Map(units.map((unit) => [unit.id, unit]));
          const savedLineByBorrowingLine = new Map(
            receipt.lines.map((line) => [line.borrowingLineId, line]),
          );
          const auditEvents: Prisma.AuditEventCreateManyInput[] = [];

          for (const requestedLine of normalizedLines) {
            const borrowingLine = lineById.get(requestedLine.borrowingLineId);
            const savedLine = savedLineByBorrowingLine.get(requestedLine.borrowingLineId);
            const unit = borrowingLine && unitById.get(borrowingLine.unitId);
            if (!borrowingLine || !savedLine || !unit) {
              throw new ReceiveReturnError("LINES_UNAVAILABLE", "Data unit tidak lengkap.");
            }

            const readiness = requestedLine.condition === "GOOD"
              ? unit.readiness
              : "PENDING_INSPECTION";
            await tx.itemUnit.update({
              where: { id: unit.id },
              data: {
                custody: "HOUSEKEEPING",
                condition: requestedLine.condition,
                readiness,
                locationId: requestedLine.locationId,
                updatedById: actorId,
              },
            });
            auditEvents.push({
              actorId,
              action: "BORROWING_RETURNED",
              entityType: "ITEM_UNIT",
              entityId: unit.id,
              oldValues: {
                custody: unit.custody,
                condition: unit.condition,
                readiness: unit.readiness,
                locationId: unit.locationId,
              },
              newValues: {
                custody: "HOUSEKEEPING",
                condition: requestedLine.condition,
                readiness,
                locationId: requestedLine.locationId,
                returnBatchId: receipt.id,
                returnLineId: savedLine.id,
                borrowingId: borrowingLine.borrowingId,
                borrowingLineId: borrowingLine.id,
                guestVisitId: input.guestVisitId,
                primaryGuestNameSnapshot: borrowingLine.borrowing.primaryGuestNameSnapshot,
                roomNumberSnapshot: borrowingLine.borrowing.roomNumberSnapshot,
                receivedAt: receivedAt.toISOString(),
              },
            });
          }

          const events = await tx.auditEvent.createManyAndReturn({
            data: auditEvents,
            select: { id: true, entityId: true },
          });
          const receiptLineByUnit = new Map(
            receipt.lines.map((line) => [line.borrowingLine.unitId, line]),
          );
          const photoRows = events.flatMap((event) => {
            const savedLine = receiptLineByUnit.get(event.entityId);
            const keys = savedLine && keysByLine.get(savedLine.borrowingLineId);
            if (!savedLine || !keys) {
              throw new ReceiveReturnError("INVALID_PHOTOS", "Referensi foto pengembalian tidak lengkap.");
            }
            return keys.map((photoKey) => ({
              unitId: event.entityId,
              auditEventId: event.id,
              borrowingLineId: savedLine.borrowingLineId,
              returnLineId: savedLine.id,
              photoKey,
            }));
          });
          if (photoRows.length) await tx.itemUnitPhoto.createMany({ data: photoRows });

          await tx.auditEvent.create({
            data: {
              actorId,
              action: "RETURN_CREATED",
              entityType: "RETURN_BATCH",
              entityId: receipt.id,
              newValues: {
                guestVisitId: input.guestVisitId,
                defaultLocationId: input.defaultLocationId,
                borrowingLineIds: lineIds,
                receivedAt: receivedAt.toISOString(),
              },
            },
          });

          return { receipt, replayed: false };
        } catch (error) {
          knownRollback = true;
          throw error;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15_000,
      },
    );

    if (result.replayed) {
      await Promise.allSettled(storedKeys.map((key) => removeUnitPhoto(key)));
    }
    return result;
  } catch (error) {
    const knownPrismaRollback = error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code);
    if (!transactionStarted || knownRollback || knownPrismaRollback) {
      await Promise.allSettled(storedKeys.map((key) => removeUnitPhoto(key)));
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const replay = await findReplay(db, input.requestId, actorId, requestHash);
        if (replay) return replay;
      }
      if (error.code === "P2034") {
        throw new ReceiveReturnError(
          "RETRY_REQUIRED",
          "Data sedang berubah. Ulangi dengan ID request dan foto yang sama.",
        );
      }
    }
    throw error;
  }
}
