import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type ItemUnit } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  verifyUnitsInputSchema,
  type VerifyUnitsInput,
} from "@/server/verify-units-input";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

const BATCH_ACTION = "UNIT_VERIFICATION_BATCH_SAVED";
const UNIT_ACTION = "ITEM_UNIT_VERIFIED";

type VerificationResult = "FIT_FOR_USE" | "UNFIT_FOR_USE";
type VerificationReadiness = "CLEAR" | "ON_HOLD";

type ErrorCode =
  | "PHOTOS_REQUIRED"
  | "REQUEST_CONFLICT"
  | "UNITS_NOT_FOUND"
  | "STALE_UNIT"
  | "UNIT_STATE_CONFLICT"
  | "OUTSTANDING_BORROWING"
  | "RETRY_REQUIRED";

export class VerifyUnitsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VerifyUnitsError";
  }
}

type LockedUnit = Pick<
  ItemUnit,
  | "id"
  | "lifecycle"
  | "custody"
  | "condition"
  | "readiness"
  | "lossState"
  | "updatedAt"
>;

async function findReplay(
  client: Prisma.TransactionClient | typeof db,
  input: VerifyUnitsInput,
  actorId: string,
  requestHash: string,
) {
  const batch = await client.auditEvent.findUnique({
    where: { id: input.requestId },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      actorId: true,
      newValues: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
  });

  if (!batch) return null;

  const values = batch.newValues;

  if (
    batch.action !== BATCH_ACTION ||
    batch.entityType !== "UNIT_VERIFICATION_BATCH" ||
    batch.entityId !== input.requestId ||
    batch.actorId !== actorId ||
    !values ||
    typeof values !== "object" ||
    Array.isArray(values) ||
    values.requestHash !== requestHash
  ) {
    throw new VerifyUnitsError(
      "REQUEST_CONFLICT",
      "ID request sudah digunakan untuk tindakan lain.",
    );
  }

  const events = await client.auditEvent.findMany({
    where: {
      action: UNIT_ACTION,
      entityType: "ITEM_UNIT",
      entityId: { in: input.units.map((unit) => unit.unitId) },
      newValues: {
        path: ["verificationId"],
        equals: input.requestId,
      },
    },
    orderBy: { entityId: "asc" },
    select: {
      id: true,
      entityId: true,
      reason: true,
      newValues: true,
      photos: {
        orderBy: { id: "asc" },
        select: { id: true },
      },
    },
  });

  if (events.length !== input.units.length) {
    throw new Error("Saved verification evidence is incomplete");
  }

  return {
    verification: {
      id: batch.id,
      verifiedAt: batch.createdAt,
      verifiedBy: batch.actor,
      units: events.map((event) => {
        const state = event.newValues;

        if (!state || typeof state !== "object" || Array.isArray(state)) {
          throw new Error("Saved verification result is invalid");
        }

        const result = state.result;
        const readiness = state.readiness;
        if (
          typeof result !== "string" ||
          !["FIT_FOR_USE", "UNFIT_FOR_USE"].includes(result) ||
          typeof readiness !== "string" ||
          !["CLEAR", "ON_HOLD"].includes(readiness)
        ) {
          throw new Error("Saved verification result is invalid");
        }

        return {
          eventId: event.id,
          unitId: event.entityId,
          result: result as VerificationResult,
          condition: state.condition,
          readiness: readiness as VerificationReadiness,
          notes: event.reason,
          photos: event.photos.map((photo) => ({
            id: photo.id,
            url: `/api/item-units/${event.entityId}/photos/${photo.id}`,
          })),
        };
      }),
    },
    replayed: true,
  };
}

export async function verifyUnits(
  rawInput: unknown,
  actorId: string,
  photos: File[][] = [],
) {
  const input = verifyUnitsInputSchema.parse(rawInput);

  if (
    photos.length !== input.units.length ||
    photos.some((group) => !Array.isArray(group) || group.length === 0)
  ) {
    throw new VerifyUnitsError(
      "PHOTOS_REQUIRED",
      "Setiap unit wajib memiliki minimal satu foto verifikasi.",
    );
  }

  const lines = input.units.map((unit, index) => ({
    ...unit,
    photos: photos[index],
    photoHashes: [] as string[],
  }));

  for (const line of lines) {
    for (const file of line.photos) {
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        file.size > MAX_PHOTO_BYTES
      ) {
        throw new InvalidUnitPhotoError(
          "Setiap foto harus berukuran 1 byte sampai 2 MiB.",
        );
      }

      line.photoHashes.push(
        createHash("sha256")
          .update(Buffer.from(await file.arrayBuffer()))
          .digest("hex"),
      );
    }
  }

  lines.sort((a, b) => a.unitId.localeCompare(b.unitId));

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify(
        lines.map((line) => ({
          unitId: line.unitId,
          expectedUpdatedAt: line.expectedUpdatedAt,
          result: line.result,
          notes: line.notes,
          photoHashes: line.photoHashes,
        })),
      ),
    )
    .digest("hex");

  const existing = await findReplay(db, input, actorId, requestHash);
  if (existing) return existing;

  const storedKeys: string[] = [];
  const keysByUnit = new Map<string, string[]>();
  let transactionStarted = false;
  let knownRollback = false;

  try {
    for (const line of lines) {
      const keys: string[] = [];

      for (const file of line.photos) {
        const key = await storeUnitPhoto(await prepareUnitPhoto(file));
        storedKeys.push(key);
        keys.push(key);
      }

      keysByUnit.set(line.unitId, keys);
    }

    const result = await db.$transaction(
      async (tx) => {
        transactionStarted = true;

        try {
          const lockKey = `unit-verification:${input.requestId}`;
          await tx.$queryRaw`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
          `;

          const replay = await findReplay(tx, input, actorId, requestHash);
          if (replay) return replay;

          const unitIds = lines.map((line) => line.unitId);
          const units = await tx.$queryRaw<LockedUnit[]>`
            SELECT
              "id", "lifecycle", "custody", "condition",
              "readiness", "lossState", "updatedAt"
            FROM "item_unit"
            WHERE "id" IN (${Prisma.join(unitIds)})
            ORDER BY "id"
            FOR UPDATE
          `;

          if (units.length !== lines.length) {
            throw new VerifyUnitsError(
              "UNITS_NOT_FOUND",
              "Sebagian unit tidak ditemukan.",
            );
          }

          const outstanding = await tx.borrowingLine.findFirst({
            where: {
              unitId: { in: unitIds },
              status: "OUTSTANDING",
            },
            select: { id: true },
          });

          if (outstanding) {
            throw new VerifyUnitsError(
              "OUTSTANDING_BORROWING",
              "Sebagian unit masih memiliki pinjaman aktif.",
            );
          }

          const byId = new Map(units.map((unit) => [unit.id, unit]));

          for (const line of lines) {
            const unit = byId.get(line.unitId);

            if (!unit) {
              throw new VerifyUnitsError(
                "UNITS_NOT_FOUND",
                "Unit tidak ditemukan.",
              );
            }

            if (unit.updatedAt.toISOString() !== line.expectedUpdatedAt) {
              throw new VerifyUnitsError(
                "STALE_UNIT",
                "Data unit sudah berubah. Muat ulang sebelum verifikasi.",
              );
            }

            if (
              unit.lifecycle !== "ACTIVE" ||
              unit.lossState !== "NONE" ||
              unit.custody === "GUEST" ||
              unit.readiness === "CLEAR"
            ) {
              throw new VerifyUnitsError(
                "UNIT_STATE_CONFLICT",
                "Sebagian unit tidak berada dalam status yang dapat diverifikasi.",
              );
            }
          }

          await tx.auditEvent.create({
            data: {
              id: input.requestId,
              actorId,
              action: BATCH_ACTION,
              entityType: "UNIT_VERIFICATION_BATCH",
              entityId: input.requestId,
              newValues: { requestHash },
            },
          });

          for (const line of lines) {
            const unit = byId.get(line.unitId)!;
            const readiness =
              line.result === "FIT_FOR_USE" ? "CLEAR" : "ON_HOLD";

            await tx.itemUnit.update({
              where: { id: unit.id },
              data: {
                readiness,
                updatedById: actorId,
                updatedAt: new Date(
                  Math.max(Date.now(), unit.updatedAt.getTime() + 1),
                ),
              },
            });

            const event = await tx.auditEvent.create({
              data: {
                actorId,
                action: UNIT_ACTION,
                entityType: "ITEM_UNIT",
                entityId: unit.id,
                reason: line.notes,
                oldValues: {
                  condition: unit.condition,
                  readiness: unit.readiness,
                },
                newValues: {
                  verificationId: input.requestId,
                  result: line.result,
                  condition: unit.condition,
                  readiness,
                },
              },
              select: { id: true },
            });

            await tx.itemUnitPhoto.createMany({
              data: keysByUnit.get(unit.id)!.map((photoKey) => ({
                unitId: unit.id,
                auditEventId: event.id,
                photoKey,
              })),
            });
          }

          const saved = await findReplay(tx, input, actorId, requestHash);
          if (!saved) throw new Error("Verification was not persisted");

          return { ...saved, replayed: false };
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
      await Promise.allSettled(storedKeys.map(removeUnitPhoto));
    }

    return result;
  } catch (error) {
    const knownPrismaRollback =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code);

    // Preserve evidence when the COMMIT result is uncertain.
    if (!transactionStarted || knownRollback || knownPrismaRollback) {
      await Promise.allSettled(storedKeys.map(removeUnitPhoto));
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const replay = await findReplay(db, input, actorId, requestHash);
        if (replay) return replay;
      }

      if (error.code === "P2034") {
        throw new VerifyUnitsError(
          "RETRY_REQUIRED",
          "Data sedang berubah. Ulangi dengan ID request dan foto yang sama.",
        );
      }
    }

    throw error;
  }
}
