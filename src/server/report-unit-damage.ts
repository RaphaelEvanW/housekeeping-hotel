import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

const ACTION = "ITEM_UNIT_DAMAGE_REPORTED";

type ErrorCode =
  | "REQUEST_CONFLICT"
  | "UNIT_NOT_FOUND"
  | "UNIT_STATE_CONFLICT"
  | "OUTSTANDING_BORROWING"
  | "GOOD_RETURN_REQUIRED"
  | "RETRY_REQUIRED";

export class UnitDamageReportError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UnitDamageReportError";
  }
}

const reportSelect = {
  id: true,
  entityId: true,
  reason: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
  photos: {
    orderBy: { id: "asc" },
    select: { id: true },
  },
} satisfies Prisma.AuditEventSelect;

type SavedReport = Prisma.AuditEventGetPayload<{
  select: typeof reportSelect;
}>;

function reportView(event: SavedReport) {
  return {
    id: event.id,
    unitId: event.entityId,
    notes: event.reason,
    reportedAt: event.createdAt,
    reportedBy: event.actor,
    photos: event.photos.map((photo) => ({
      id: photo.id,
      url: `/api/item-units/${event.entityId}/photos/${photo.id}`,
    })),
  };
}

async function findReplay(
  client: Prisma.TransactionClient | typeof db,
  requestId: string,
  unitId: string,
  actorId: string,
  requestHash: string,
) {
  const event = await client.auditEvent.findUnique({
    where: { id: requestId },
    select: {
      ...reportSelect,
      action: true,
      entityType: true,
      actorId: true,
      newValues: true,
    },
  });

  if (!event) return null;

  const values = event.newValues;

  if (
    event.action !== ACTION ||
    event.entityType !== "ITEM_UNIT" ||
    event.entityId !== unitId ||
    event.actorId !== actorId ||
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    values.requestHash !== requestHash
  ) {
    throw new UnitDamageReportError(
      "REQUEST_CONFLICT",
      "ID request sudah digunakan untuk laporan lain.",
    );
  }

  return { report: reportView(event), replayed: true };
}

export async function reportUnitDamage(
  rawInput: unknown,
  actorId: string,
  photos: File[] = [],
) {
  const input = reportUnitDamageInputSchema.parse(rawInput);
  const photoHashes: string[] = [];

  for (const file of photos) {
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > MAX_PHOTO_BYTES
    ) {
      throw new InvalidUnitPhotoError(
        "Setiap foto harus berukuran 1 byte sampai 2 MiB.",
      );
    }

    photoHashes.push(
      createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex"),
    );
  }

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        unitId: input.unitId,
        condition: input.condition,
        notes: input.notes,
        photoHashes,
      }),
    )
    .digest("hex");

  const existing = await findReplay(
    db,
    input.requestId,
    input.unitId,
    actorId,
    requestHash,
  );
  if (existing) return existing;

  const storedKeys: string[] = [];
  let transactionStarted = false;
  let knownRollback = false;

  try {
    for (const file of photos) {
      storedKeys.push(await storeUnitPhoto(await prepareUnitPhoto(file)));
    }

    const result = await db.$transaction(
      async (tx) => {
        transactionStarted = true;

        try {
          const lockKey = `unit-damage:${input.requestId}`;
          await tx.$queryRaw`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
          `;

          const replay = await findReplay(
            tx,
            input.requestId,
            input.unitId,
            actorId,
            requestHash,
          );
          if (replay) return replay;

          const [lockedUnit] = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id"
            FROM "item_unit"
            WHERE "id" = ${input.unitId}
            FOR UPDATE
          `;

          if (!lockedUnit) {
            throw new UnitDamageReportError(
              "UNIT_NOT_FOUND",
              "Unit barang tidak ditemukan.",
            );
          }

          const before = await tx.itemUnit.findUniqueOrThrow({
            where: { id: input.unitId },
          });

          if (before.custody === "GUEST" || before.lossState !== "NONE") {
            throw new UnitDamageReportError(
              "UNIT_STATE_CONFLICT",
              "Unit masih bersama tamu atau memiliki status kehilangan. Gunakan alur pengembalian atau penanganan kehilangan yang sesuai.",
            );
          }

          const outstanding = await tx.borrowingLine.findFirst({
            where: {
              unitId: input.unitId,
              status: "OUTSTANDING",
            },
            select: { id: true },
          });

          if (outstanding) {
            throw new UnitDamageReportError(
              "OUTSTANDING_BORROWING",
              "Unit masih memiliki pinjaman aktif. Selesaikan penerimaan fisiknya melalui pengembalian.",
            );
          }

          const [lastReturn] = await tx.$queryRaw<
            { condition: string }[]
          >`
            SELECT rl."condition"
            FROM "return_line" AS rl
            JOIN "return_batch" AS rb
              ON rb."id" = rl."returnBatchId"
            JOIN "borrowing_line" AS bl
              ON bl."id" = rl."borrowingLineId"
            WHERE bl."unitId" = ${input.unitId}
            ORDER BY rb."receivedAt" DESC, rb."id" DESC
            LIMIT 1
          `;

          if (lastReturn?.condition !== "GOOD") {
            throw new UnitDamageReportError(
              "GOOD_RETURN_REQUIRED",
              "Laporan ini digunakan untuk kerusakan yang ditemukan setelah pengembalian berkondisi baik.",
            );
          }

          await tx.itemUnit.update({
            where: { id: input.unitId },
            data: {
              condition: input.condition,
              readiness: "ON_HOLD",
              updatedById: actorId,
            },
          });

          await tx.auditEvent.create({
            data: {
              id: input.requestId,
              actorId,
              action: ACTION,
              entityType: "ITEM_UNIT",
              entityId: input.unitId,
              reason: input.notes,
              oldValues: {
                condition: before.condition,
                readiness: before.readiness,
              },
              newValues: {
                condition: input.condition,
                readiness: "ON_HOLD",
                requestHash,
              },
            },
          });

          if (storedKeys.length > 0) {
            await tx.itemUnitPhoto.createMany({
              data: storedKeys.map((photoKey) => ({
                unitId: input.unitId,
                auditEventId: input.requestId,
                photoKey,
              })),
            });
          }

          const event = await tx.auditEvent.findUniqueOrThrow({
            where: { id: input.requestId },
            select: reportSelect,
          });

          return { report: reportView(event), replayed: false };
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
      await Promise.allSettled(
        storedKeys.map((key) => removeUnitPhoto(key)),
      );
    }

    return result;
  } catch (error) {
    const knownPrismaRollback =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code);

    // Keep staged evidence when COMMIT may have succeeded.
    if (!transactionStarted || knownRollback || knownPrismaRollback) {
      await Promise.allSettled(
        storedKeys.map((key) => removeUnitPhoto(key)),
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const replay = await findReplay(
          db,
          input.requestId,
          input.unitId,
          actorId,
          requestHash,
        );
        if (replay) return replay;
      }

      if (error.code === "P2034") {
        throw new UnitDamageReportError(
          "RETRY_REQUIRED",
          "Data sedang berubah. Ulangi dengan ID request dan foto yang sama.",
        );
      }
    }

    throw error;
  }
}
