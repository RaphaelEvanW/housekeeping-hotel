import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type UnitCondition } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  handoverUnitInputSchema,
  maintenanceIdSchema,
  receiveMaintainedUnitInputSchema,
  type HandoverUnitInput,
  type ReceiveMaintainedUnitInput,
} from "@/server/unit-maintenance-input";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

const HANDOVER_ACTION = "ITEM_UNIT_SENT_TO_ENGINEERING";
const RECEIPT_ACTION = "ITEM_UNIT_RECEIVED_FROM_ENGINEERING";

type ErrorCode =
  | "PHOTOS_REQUIRED"
  | "UNIT_NOT_FOUND"
  | "HANDOVER_NOT_FOUND"
  | "UNIT_STATE_CONFLICT"
  | "OUTSTANDING_BORROWING"
  | "STALE_UNIT"
  | "MAINTENANCE_OPEN"
  | "ALREADY_RECEIVED"
  | "LOCATION_UNAVAILABLE"
  | "INVALID_TIME"
  | "INVALID_WORK_RESULT"
  | "REQUEST_CONFLICT"
  | "RETRY_REQUIRED";

export class UnitMaintenanceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UnitMaintenanceError";
  }
}

type Command =
  | { kind: "HANDOVER"; data: HandoverUnitInput }
  | { kind: "RECEIPT"; data: ReceiveMaintainedUnitInput };

type Client = Prisma.TransactionClient | typeof db;

const eventSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  actorId: true,
  reason: true,
  oldValues: true,
  newValues: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
  photos: {
    orderBy: { id: "asc" },
    select: { id: true, unitId: true },
  },
} satisfies Prisma.AuditEventSelect;

type SavedEvent = Prisma.AuditEventGetPayload<{ select: typeof eventSelect }>;

function eventValues(values: Prisma.JsonValue | null): Prisma.JsonObject {
  return values && typeof values === "object" && !Array.isArray(values)
    ? values
    : {};
}

function eventView(event: SavedEvent) {
  return {
    id: event.id,
    unitId: event.entityId,
    action: event.action,
    notes: event.reason,
    recordedAt: event.createdAt,
    recordedBy: event.actor,
    before: eventValues(event.oldValues),
    after: Object.fromEntries(
      Object.entries(eventValues(event.newValues)).filter(
        ([key]) => key !== "requestHash",
      ),
    ),
    photos: event.photos
      .filter((photo) => photo.unitId === event.entityId)
      .map((photo) => ({
        id: photo.id,
        url: `/api/item-units/${event.entityId}/photos/${photo.id}`,
      })),
  };
}

function isHandover(event: SavedEvent | null): event is SavedEvent {
  return event?.action === HANDOVER_ACTION && event.entityType === "ITEM_UNIT";
}

async function findReceipt(
  client: Client,
  unitId: string,
  handoverId: string,
) {
  return client.auditEvent.findFirst({
    where: {
      entityType: "ITEM_UNIT",
      entityId: unitId,
      action: RECEIPT_ACTION,
      newValues: { path: ["handoverId"], equals: handoverId },
    },
    select: eventSelect,
  });
}

async function findReplay(
  client: Client,
  command: Command,
  actorId: string,
  requestHash: string,
) {
  const event = await client.auditEvent.findUnique({
    where: { id: command.data.requestId },
    select: { ...eventSelect, newValues: true },
  });

  if (!event) return null;

  const values = eventValues(event.newValues);
  const expectedAction =
    command.kind === "HANDOVER" ? HANDOVER_ACTION : RECEIPT_ACTION;
  const targetMatches =
    command.kind === "HANDOVER"
      ? event.entityId === command.data.unitId
      : values.handoverId === command.data.handoverId;

  if (
    event.action !== expectedAction ||
    event.entityType !== "ITEM_UNIT" ||
    event.actorId !== actorId ||
    values.requestHash !== requestHash ||
    !targetMatches
  ) {
    throw new UnitMaintenanceError(
      "REQUEST_CONFLICT",
      "ID request sudah digunakan untuk tindakan lain.",
    );
  }

  return {
    handoverId:
      command.kind === "HANDOVER"
        ? event.id
        : command.data.handoverId,
    event: eventView(event),
    replayed: true,
  };
}

async function removeStagedPhotos(keys: string[]) {
  await Promise.allSettled(keys.map(removeUnitPhoto));
}

export function handoverUnit(
  rawInput: unknown,
  actorId: string,
  photos: File[] = [],
) {
  const data = handoverUnitInputSchema.parse(rawInput);
  return recordMaintenance({ kind: "HANDOVER", data }, actorId, photos);
}

export function receiveMaintainedUnit(
  rawInput: unknown,
  actorId: string,
  photos: File[] = [],
) {
  const data = receiveMaintainedUnitInputSchema.parse(rawInput);
  return recordMaintenance({ kind: "RECEIPT", data }, actorId, photos);
}

async function recordMaintenance(
  command: Command,
  actorId: string,
  photos: File[],
) {
  if (photos.length === 0) {
    throw new UnitMaintenanceError(
      "PHOTOS_REQUIRED",
      "Minimal satu foto bukti wajib dilampirkan.",
    );
  }

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
      JSON.stringify({ operation: command.kind, ...command.data, photoHashes }),
    )
    .digest("hex");

  const replay = await findReplay(db, command, actorId, requestHash);
  if (replay) return replay;

  const handover =
    command.kind === "RECEIPT"
      ? await db.auditEvent.findUnique({
          where: { id: command.data.handoverId },
          select: eventSelect,
        })
      : null;

  if (command.kind === "RECEIPT" && !isHandover(handover)) {
    throw new UnitMaintenanceError(
      "HANDOVER_NOT_FOUND",
      "Catatan serah unit ke Engineering tidak ditemukan.",
    );
  }

  let unitId: string;
  if (command.kind === "HANDOVER") {
    unitId = command.data.unitId;
  } else {
    if (!isHandover(handover)) {
      throw new UnitMaintenanceError(
        "HANDOVER_NOT_FOUND",
        "Catatan serah unit ke Engineering tidak ditemukan.",
      );
    }
    unitId = handover.entityId;
  }
  const stagedKeys: string[] = [];
  let transactionStarted = false;
  let knownRollback = false;

  try {
    for (const file of photos) {
      stagedKeys.push(await storeUnitPhoto(await prepareUnitPhoto(file)));
    }

    const result = await db.$transaction(
      async (tx) => {
        transactionStarted = true;

        try {
          const lockKey = `unit-maintenance:${command.data.requestId}`;
          await tx.$queryRaw`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
          `;

          const replayed = await findReplay(tx, command, actorId, requestHash);
          if (replayed) return replayed;

          const [lockedUnit] = await tx.$queryRaw<{ id: string }[]>`
            SELECT "id"
            FROM "item_unit"
            WHERE "id" = ${unitId}
            FOR UPDATE
          `;

          if (!lockedUnit) {
            throw new UnitMaintenanceError(
              "UNIT_NOT_FOUND",
              "Unit barang tidak ditemukan.",
            );
          }

          const before = await tx.itemUnit.findUniqueOrThrow({
            where: { id: unitId },
          });

          if (before.updatedAt.toISOString() !== command.data.expectedUpdatedAt) {
            throw new UnitMaintenanceError(
              "STALE_UNIT",
              "Data unit sudah berubah. Muat ulang sebelum mencatat tindakan.",
            );
          }

          const occurredAt = new Date(command.data.occurredAt);
          if (occurredAt.getTime() > Date.now()) {
            throw new UnitMaintenanceError(
              "INVALID_TIME",
              "Waktu kejadian tidak boleh berada di masa depan.",
            );
          }

          if (before.lossState !== "NONE") {
            throw new UnitMaintenanceError(
              "UNIT_STATE_CONFLICT",
              "Unit yang berstatus hilang tidak dapat diserahkan atau diterima melalui alur perbaikan.",
            );
          }

          const outstanding = await tx.borrowingLine.findFirst({
            where: { unitId, status: "OUTSTANDING" },
            select: { id: true },
          });
          if (outstanding) {
            throw new UnitMaintenanceError(
              "OUTSTANDING_BORROWING",
              "Unit masih memiliki pinjaman aktif.",
            );
          }

          let next: {
            custody: "ENGINEERING" | "HOUSEKEEPING";
            condition: UnitCondition;
            readiness: "ON_HOLD" | "PENDING_VERIFICATION";
            locationId: string | null;
          };
          let details: Prisma.InputJsonObject;
          let notes: string;
          let handoverId: string;

          if (command.kind === "HANDOVER") {
            if (
              before.lifecycle !== "ACTIVE" ||
              before.custody !== "HOUSEKEEPING"
            ) {
              throw new UnitMaintenanceError(
                "UNIT_STATE_CONFLICT",
                "Hanya unit aktif yang berada di Housekeeping dapat diserahkan.",
              );
            }

            if (
              before.condition !== "GOOD" &&
              command.data.condition !== before.condition
            ) {
              throw new UnitMaintenanceError(
                "UNIT_STATE_CONFLICT",
                "Klasifikasi kerusakan yang sudah tercatat tidak dapat diubah saat serah-terima.",
              );
            }

            const latestHandover = await tx.auditEvent.findFirst({
              where: {
                entityType: "ITEM_UNIT",
                entityId: unitId,
                action: HANDOVER_ACTION,
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: { id: true },
            });
            if (
              latestHandover &&
              !(await findReceipt(tx, unitId, latestHandover.id))
            ) {
              throw new UnitMaintenanceError(
                "MAINTENANCE_OPEN",
                "Unit masih memiliki serah-terima perbaikan yang belum diterima kembali.",
              );
            }

            handoverId = command.data.requestId;
            notes = command.data.notes;
            next = {
              custody: "ENGINEERING",
              condition: command.data.condition,
              readiness: "ON_HOLD",
              locationId: null,
            };
            details = {
              handoverId,
              occurredAt: command.data.occurredAt,
              handedOverTo: command.data.handedOverTo,
            };
          } else {
            if (
              !isHandover(handover) ||
              handover.entityId !== unitId ||
              command.data.handoverId !== handover.id
            ) {
              throw new UnitMaintenanceError(
                "HANDOVER_NOT_FOUND",
                "Catatan serah unit tidak cocok dengan unit yang diterima.",
              );
            }

            if (before.custody !== "ENGINEERING") {
              throw new UnitMaintenanceError(
                "UNIT_STATE_CONFLICT",
                "Unit tidak tercatat sedang berada di Engineering.",
              );
            }

            if (await findReceipt(tx, unitId, handover.id)) {
              throw new UnitMaintenanceError(
                "ALREADY_RECEIVED",
                "Unit pada serah-terima ini sudah diterima kembali.",
              );
            }

            const handoverAt = new Date(
              String(eventValues(handover.newValues).occurredAt ?? ""),
            );
            if (
              Number.isNaN(handoverAt.getTime()) ||
              occurredAt < handoverAt
            ) {
              throw new UnitMaintenanceError(
                "INVALID_TIME",
                "Waktu penerimaan harus sama atau setelah waktu serah-terima.",
              );
            }

            const workCompletedAt = command.data.workCompletedAt
              ? new Date(command.data.workCompletedAt)
              : null;
            if (
              workCompletedAt &&
              (workCompletedAt < handoverAt || workCompletedAt > occurredAt)
            ) {
              throw new UnitMaintenanceError(
                "INVALID_TIME",
                "Waktu pekerjaan harus berada di antara serah-terima dan penerimaan.",
              );
            }

            if (
              command.data.condition !== before.condition &&
              (!command.data.performedBy || !workCompletedAt)
            ) {
              throw new UnitMaintenanceError(
                "INVALID_WORK_RESULT",
                "Perubahan kondisi memerlukan nama pelaksana dan waktu pekerjaan selesai.",
              );
            }

            const [location] = await tx.$queryRaw<{ id: string }[]>`
              SELECT "id"
              FROM "location"
              WHERE "id" = ${command.data.locationId}
                AND "isActive" = true
                AND "code" <> 'WITH_GUEST'
              FOR SHARE
            `;
            if (!location) {
              throw new UnitMaintenanceError(
                "LOCATION_UNAVAILABLE",
                "Pilih lokasi aktif Housekeeping untuk menerima unit.",
              );
            }

            handoverId = handover.id;
            notes = command.data.workPerformed;
            next = {
              custody: "HOUSEKEEPING",
              condition: command.data.condition,
              readiness: "PENDING_VERIFICATION",
              locationId: location.id,
            };
            details = {
              handoverId,
              occurredAt: command.data.occurredAt,
              receivedFrom: command.data.receivedFrom,
              performedBy: command.data.performedBy,
              workCompletedAt: command.data.workCompletedAt,
              workPerformed: command.data.workPerformed,
            };
          }

          await tx.itemUnit.update({
            where: { id: unitId },
            data: {
              ...next,
              updatedById: actorId,
              updatedAt: new Date(
                Math.max(Date.now(), before.updatedAt.getTime() + 1),
              ),
            },
          });

          await tx.auditEvent.create({
            data: {
              id: command.data.requestId,
              actorId,
              action:
                command.kind === "HANDOVER"
                  ? HANDOVER_ACTION
                  : RECEIPT_ACTION,
              entityType: "ITEM_UNIT",
              entityId: unitId,
              reason: notes,
              oldValues: {
                custody: before.custody,
                condition: before.condition,
                readiness: before.readiness,
                locationId: before.locationId,
              },
              newValues: { ...next, ...details, requestHash },
            },
          });

          await tx.itemUnitPhoto.createMany({
            data: stagedKeys.map((photoKey) => ({
              unitId,
              auditEventId: command.data.requestId,
              photoKey,
            })),
          });

          const event = await tx.auditEvent.findUniqueOrThrow({
            where: { id: command.data.requestId },
            select: eventSelect,
          });
          return { handoverId, event: eventView(event), replayed: false };
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

    if (result.replayed) await removeStagedPhotos(stagedKeys);
    return result;
  } catch (error) {
    const knownPrismaRollback =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code);

    if (!transactionStarted || knownRollback || knownPrismaRollback) {
      await removeStagedPhotos(stagedKeys);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const replay = await findReplay(db, command, actorId, requestHash);
        if (replay) return replay;
      }

      if (error.code === "P2034") {
        throw new UnitMaintenanceError(
          "RETRY_REQUIRED",
          "Data sedang berubah. Ulangi dengan ID request dan foto yang sama.",
        );
      }
    }

    throw error;
  }
}

export async function getUnitMaintenance(rawHandoverId: unknown) {
  const handoverId = maintenanceIdSchema.parse(rawHandoverId);

  return db.$transaction(
    async (tx) => {
      const before = await tx.auditEvent.findUnique({
        where: { id: handoverId },
        select: eventSelect,
      });
      if (!isHandover(before)) return null;

      const after = await findReceipt(tx, before.entityId, handoverId);
      return {
        handoverId,
        unitId: before.entityId,
        before: eventView(before),
        after: after ? eventView(after) : null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
