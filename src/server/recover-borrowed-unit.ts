import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  borrowingLossReportIdSchema,
  recoverBorrowedUnitInputSchema,
} from "@/server/borrowing-loss-input";
import {
  BorrowingLossError,
  borrowingLossReportSelect,
  borrowingLossReportView,
  lockBorrowingLine,
  lockRequest,
  mapTransactionError,
} from "@/server/borrowing-loss";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

const RECOVERY_ACTION = "BORROWING_PHYSICALLY_RECOVERED";
const readinessValues = [
  "CLEAR",
  "ON_HOLD",
  "PENDING_INSPECTION",
  "PENDING_VERIFICATION",
] as const;

function isReadiness(
  value: Prisma.JsonValue | undefined,
): value is (typeof readinessValues)[number] {
  return (
    typeof value === "string" &&
    readinessValues.includes(value as (typeof readinessValues)[number])
  );
}

const recoveryEventSelect = {
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

type RecoveryEvent = Prisma.AuditEventGetPayload<{
  select: typeof recoveryEventSelect;
}>;

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

function recoveryView(event: RecoveryEvent) {
  const before = jsonObject(event.oldValues);
  const after = jsonObject(event.newValues);
  delete before.requestHash;
  delete after.requestHash;

  return {
    id: event.id,
    unitId: event.entityId,
    notes: event.reason,
    recordedAt: event.createdAt,
    recordedBy: event.actor,
    before,
    after,
    photos: event.photos
      .filter((photo) => photo.unitId === event.entityId)
      .map((photo) => ({
        id: photo.id,
        url: `/api/item-units/${event.entityId}/photos/${photo.id}`,
      })),
  };
}

async function findReplay(
  client: Prisma.TransactionClient | typeof db,
  requestId: string,
  reportId: string,
  actorId: string,
  requestHash: string,
) {
  const event = await client.auditEvent.findUnique({
    where: { id: requestId },
    select: {
      ...recoveryEventSelect,
      newValues: true,
    },
  });
  if (!event) return null;

  const values = jsonObject(event.newValues);
  if (
    event.action !== RECOVERY_ACTION ||
    event.entityType !== "ITEM_UNIT" ||
    event.actorId !== actorId ||
    values.lossReportId !== reportId ||
    values.requestHash !== requestHash
  ) {
    throw new BorrowingLossError(
      "REQUEST_CONFLICT",
      "ID permintaan sudah digunakan untuk pencatatan lain.",
    );
  }

  return { recovery: recoveryView(event), replayed: true };
}

async function removeStagedPhotos(keys: string[]) {
  await Promise.allSettled(keys.map((key) => removeUnitPhoto(key)));
}

export async function recoverBorrowedUnit(
  rawReportId: unknown,
  rawInput: unknown,
  actorId: string,
  photos: File[] = [],
) {
  const reportId = borrowingLossReportIdSchema.parse(rawReportId);
  const input = recoverBorrowedUnitInputSchema.parse(rawInput);
  if (photos.length === 0) {
    throw new BorrowingLossError(
      "PHOTOS_REQUIRED",
      "Lampirkan minimal satu foto saat menerima unit.",
    );
  }

  const photoHashes: string[] = [];
  for (const photo of photos) {
    if (
      !(photo instanceof File) ||
      photo.size === 0 ||
      photo.size > MAX_PHOTO_BYTES
    ) {
      throw new InvalidUnitPhotoError(
        "Setiap foto harus berukuran 1 byte sampai 2 MiB.",
      );
    }
    photoHashes.push(
      createHash("sha256")
        .update(Buffer.from(await photo.arrayBuffer()))
        .digest("hex"),
    );
  }

  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        reportId,
        ...input,
        photoHashes,
      }),
    )
    .digest("hex");

  const prior = await findReplay(
    db,
    input.requestId,
    reportId,
    actorId,
    requestHash,
  );
  if (prior) return prior;

  const storedKeys: string[] = [];
  let transactionStarted = false;
  let knownRollback = false;

  try {
    for (const photo of photos) {
      storedKeys.push(await storeUnitPhoto(await prepareUnitPhoto(photo)));
    }

    const result = await db.$transaction(
      async (tx) => {
        transactionStarted = true;
        try {
          await lockRequest(tx, input.requestId);
          const replay = await findReplay(
            tx,
            input.requestId,
            reportId,
            actorId,
            requestHash,
          );
          if (replay) return replay;

          const candidate = await tx.borrowingLossReport.findUnique({
            where: { id: reportId },
            select: { borrowingLineId: true },
          });
          if (!candidate) {
            throw new BorrowingLossError(
              "REPORT_NOT_FOUND",
              "Laporan kehilangan tidak ditemukan.",
            );
          }

          const state = await lockBorrowingLine(tx, candidate.borrowingLineId);
          await tx.$queryRaw`
            SELECT "id" FROM "borrowing_loss_report"
            WHERE "id" = ${reportId}
            FOR UPDATE
          `;
          const report = await tx.borrowingLossReport.findUnique({
            where: { id: reportId },
            select: borrowingLossReportSelect,
          });
          if (!report) {
            throw new BorrowingLossError(
              "REPORT_NOT_FOUND",
              "Laporan kehilangan tidak ditemukan.",
            );
          }
          if (report.status !== "APPROVED") {
            throw new BorrowingLossError(
              "REPORT_NOT_APPROVED",
              "Unit hanya dapat diterima melalui laporan kehilangan yang telah disetujui.",
            );
          }
          const resolutionMethod = state.resolutionMethod;
          const settledByProposal =
            state.status === "SETTLED" &&
            (resolutionMethod === "COMPENSATION" || resolutionMethod === "REPLACEMENT" || resolutionMethod === "WRITE_OFF") &&
            (await tx.borrowingLossSettlement.findFirst({
              where: { lossReportId: reportId, status: "APPROVED", method: resolutionMethod },
              select: { id: true },
            })) !== null;
          if (state.status !== "OUTSTANDING" && !settledByProposal) {
            throw new BorrowingLossError(
              "LINE_NOT_OUTSTANDING",
              "Kewajiban pinjaman unit ini sudah diselesaikan.",
            );
          }
          if (
            state.unit.custody !== "GUEST" ||
            state.unit.lossState !== "LOST" ||
            state.unit.readiness !== "ON_HOLD"
          ) {
            throw new BorrowingLossError(
              "UNIT_STATE_CONFLICT",
              "Keadaan unit sudah berubah. Muat ulang sebelum mencatat penerimaan.",
            );
          }
          if (state.unit.updatedAt.toISOString() !== input.expectedUpdatedAt) {
            throw new BorrowingLossError(
              "STALE_UNIT",
              "Data unit sudah berubah. Muat ulang sebelum mencatat penerimaan.",
            );
          }
          if (
            state.unit.condition !== "GOOD" &&
            input.condition !== state.unit.condition
          ) {
            throw new BorrowingLossError(
              "CONDITION_CONFLICT",
              "Kondisi rusak yang sudah tercatat hanya dapat dipulihkan melalui pencatatan perbaikan.",
            );
          }

          const occurredAt = new Date(input.occurredAt);
          const recordedAt = new Date();
          if (
            !report.closedAt ||
            occurredAt < report.closedAt ||
            occurredAt < state.line.borrowing.issuedAt ||
            occurredAt > recordedAt
          ) {
            throw new BorrowingLossError(
              "INVALID_TIME",
              "Waktu penerimaan harus setelah persetujuan dan waktu pinjam, serta tidak boleh di masa depan.",
            );
          }

          const approval = await tx.auditEvent.findFirst({
            where: {
              action: "BORROWING_LOSS_APPROVED",
              entityType: "ITEM_UNIT",
              entityId: state.unit.id,
              newValues: { path: ["lossReportId"], equals: reportId },
            },
            select: { oldValues: true },
          });
          const previousReadiness = jsonObject(approval?.oldValues ?? null).readiness;
          if (!isReadiness(previousReadiness)) {
            throw new BorrowingLossError(
              "UNIT_STATE_CONFLICT",
              "Riwayat status unit sebelum persetujuan tidak tersedia untuk pemulihan yang aman.",
            );
          }

          const [location] = await tx.$queryRaw<
            { id: string; code: string; name: string }[]
          >`
            SELECT "id", "code", "name"
            FROM "location"
            WHERE "id" = ${input.locationId}
              AND "isActive" = true
              AND "code" <> 'WITH_GUEST'
            FOR SHARE
          `;
          if (!location) {
            throw new BorrowingLossError(
              "LOCATION_UNAVAILABLE",
              "Pilih lokasi Housekeeping yang masih aktif.",
            );
          }

          const readiness =
            previousReadiness !== "CLEAR"
              ? previousReadiness
              : input.condition === "GOOD"
                ? "CLEAR"
                : "PENDING_INSPECTION";
          if (!settledByProposal) {
            const resolved = await tx.borrowingLine.updateMany({
              where: { id: state.line.id, status: "OUTSTANDING" },
              data: {
                status: "SETTLED",
                resolutionMethod: "PHYSICAL_RECOVERY",
                resolvedAt: occurredAt,
              },
            });
            if (resolved.count !== 1) {
              throw new BorrowingLossError(
                "LINE_NOT_OUTSTANDING",
                "Kewajiban pinjaman unit ini sudah diselesaikan.",
              );
            }
          }

          await tx.itemUnit.update({
            where: { id: state.unit.id },
            data: {
              custody: "HOUSEKEEPING",
              locationId: location.id,
              condition: input.condition,
              lossState: "NONE",
              readiness,
              updatedById: actorId,
              updatedAt: new Date(
                Math.max(recordedAt.getTime(), state.unit.updatedAt.getTime() + 1),
              ),
            },
          });

          await tx.auditEvent.create({
            data: {
              id: input.requestId,
              actorId,
              action: RECOVERY_ACTION,
              entityType: "ITEM_UNIT",
              entityId: state.unit.id,
              reason: input.notes,
              oldValues: {
                custody: state.unit.custody,
                locationId: state.unit.locationId,
                condition: state.unit.condition,
                readiness: state.unit.readiness,
                lossState: state.unit.lossState,
                borrowingStatus: state.status,
                resolutionMethod: state.resolutionMethod,
              },
              newValues: {
                lossReportId: reportId,
                borrowingLineId: state.line.id,
                borrowingId: state.line.borrowingId,
                guestVisitId: state.line.borrowing.guestVisitId,
                primaryGuestNameSnapshot:
                  state.line.borrowing.primaryGuestNameSnapshot,
                roomNumberSnapshot: state.line.borrowing.roomNumberSnapshot,
                custody: "HOUSEKEEPING",
                locationId: location.id,
                locationCode: location.code,
                locationName: location.name,
                condition: input.condition,
                readiness,
                lossState: "NONE",
                borrowingStatus: "SETTLED",
                resolutionMethod: settledByProposal ? resolutionMethod : "PHYSICAL_RECOVERY",
                occurredAt: occurredAt.toISOString(),
                requestHash,
              },
            },
          });

          await tx.itemUnitPhoto.createMany({
            data: storedKeys.map((photoKey) => ({
              unitId: state.unit.id,
              borrowingLineId: state.line.id,
              auditEventId: input.requestId,
              photoKey,
            })),
          });

          const event = await tx.auditEvent.findUniqueOrThrow({
            where: { id: input.requestId },
            select: recoveryEventSelect,
          });
          return { recovery: recoveryView(event), replayed: false };
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

    if (result.replayed) await removeStagedPhotos(storedKeys);
    return result;
  } catch (error) {
    const knownPrismaRollback =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code);
    if (!transactionStarted || knownRollback || knownPrismaRollback) {
      await removeStagedPhotos(storedKeys);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        const replay = await findReplay(
          db,
          input.requestId,
          reportId,
          actorId,
          requestHash,
        );
        if (replay) return replay;
      }
    }
    mapTransactionError(error);
  }
}

export async function getBorrowingRecovery(rawReportId: unknown) {
  const reportId = borrowingLossReportIdSchema.parse(rawReportId);
  return db.$transaction(
    async (tx) => {
      const report = await tx.borrowingLossReport.findUnique({
        where: { id: reportId },
        select: borrowingLossReportSelect,
      });
      if (!report) return null;

      const event = await tx.auditEvent.findFirst({
        where: {
          action: RECOVERY_ACTION,
          entityType: "ITEM_UNIT",
          entityId: report.borrowingLine.unitId,
          newValues: { path: ["lossReportId"], equals: reportId },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: recoveryEventSelect,
      });

      return { report: borrowingLossReportView(report), recovery: event ? recoveryView(event) : null };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
