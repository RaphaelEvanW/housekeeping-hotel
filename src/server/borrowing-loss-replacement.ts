import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  BorrowingLossError,
  borrowingLossSettlementSelect,
  borrowingLossSettlementView,
  lockRequest,
  mapTransactionError,
} from "@/server/borrowing-loss";
import { borrowingLossReportIdSchema } from "@/server/borrowing-loss-input";
import { proposeReplacementInputSchema } from "@/server/borrowing-loss-settlement-input";
import {
  assertNoPendingSettlement,
  assertReplacementItem,
  assertUnresolvedLoss,
  lockReport,
} from "@/server/borrowing-loss-settlement";
import {
  InvalidUnitPhotoError,
  MAX_PHOTO_BYTES,
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "@/server/unit-photo";

async function findReplay(
  client: Prisma.TransactionClient | typeof db,
  requestId: string,
  reportId: string,
  actorId: string,
  requestHash: string,
) {
  const prior = await client.borrowingLossSettlement.findUnique({
    where: { id: requestId },
    select: { ...borrowingLossSettlementSelect, requestHash: true, proposedById: true },
  });
  if (!prior) return null;
  const { requestHash: savedHash, proposedById, ...settlement } = prior;
  if (
    savedHash !== requestHash || proposedById !== actorId ||
    prior.lossReportId !== reportId || prior.method !== "REPLACEMENT"
  ) {
    throw new BorrowingLossError("REQUEST_CONFLICT", "ID permintaan sudah digunakan untuk pengajuan lain.");
  }
  return { settlement: borrowingLossSettlementView(settlement), replayed: true };
}

export async function proposeReplacement(
  rawReportId: unknown,
  rawInput: unknown,
  actorId: string,
  photos: File[] = [],
) {
  const reportId = borrowingLossReportIdSchema.parse(rawReportId);
  const input = proposeReplacementInputSchema.parse(rawInput);
  if (!photos.length) {
    throw new BorrowingLossError("PHOTOS_REQUIRED", "Lampirkan minimal satu foto barang pengganti yang diterima.");
  }
  const photoHashes: string[] = [];
  for (const photo of photos) {
    if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_PHOTO_BYTES) {
      throw new InvalidUnitPhotoError("Setiap foto harus berukuran 1 byte sampai 2 MiB.");
    }
    photoHashes.push(createHash("sha256").update(Buffer.from(await photo.arrayBuffer())).digest("hex"));
  }
  const details = {
    replacementItemId: input.replacementItemId,
    replacementName: input.name ?? null,
    replacementSerialNumber: input.serialNumber,
    replacementCondition: input.condition,
    receivedAt: input.receivedAt,
    receiptConfirmed: input.receiptConfirmed,
    notes: input.notes,
  };
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ reportId, ...details, photoHashes })).digest("hex");
  const prior = await findReplay(db, input.requestId, reportId, actorId, requestHash);
  if (prior) return prior;

  const storedKeys: string[] = [];
  let transactionStarted = false;
  let knownRollback = false;
  const cleanup = () => Promise.allSettled(storedKeys.map((key) => removeUnitPhoto(key)));

  try {
    for (const photo of photos) {
      storedKeys.push(await storeUnitPhoto(await prepareUnitPhoto(photo)));
    }
    const result = await db.$transaction(async (tx) => {
      transactionStarted = true;
      try {
        await lockRequest(tx, input.requestId);
        const replay = await findReplay(tx, input.requestId, reportId, actorId, requestHash);
        if (replay) return replay;
        const state = await lockReport(tx, reportId);
        assertUnresolvedLoss(state);
        await assertNoPendingSettlement(tx, reportId);
        await assertReplacementItem(tx, input.replacementItemId);
        const receivedAt = new Date(input.receivedAt);
        if (receivedAt < state.line.borrowing.issuedAt || receivedAt > new Date()) {
          throw new BorrowingLossError("INVALID_TIME", "Waktu penerimaan harus setelah waktu peminjaman dan tidak boleh di masa depan.");
        }
        const settlement = await tx.borrowingLossSettlement.create({
          data: {
            id: input.requestId,
            lossReportId: reportId,
            method: "REPLACEMENT",
            replacementItemId: details.replacementItemId,
            replacementName: details.replacementName,
            replacementSerialNumber: details.replacementSerialNumber,
            replacementCondition: details.replacementCondition,
            receivedAt,
            notes: input.notes,
            requestHash,
            proposedById: actorId,
            photos: { create: storedKeys.map((photoKey) => ({ photoKey })) },
          },
          select: borrowingLossSettlementSelect,
        });
        const view = borrowingLossSettlementView(settlement);
        await tx.auditEvent.create({
          data: {
            id: input.requestId,
            actorId,
            action: "BORROWING_REPLACEMENT_PROPOSED",
            entityType: "ITEM_UNIT",
            entityId: state.unit.id,
            reason: input.notes,
            newValues: {
              settlementId: settlement.id,
              lossReportId: reportId,
              borrowingLineId: state.line.id,
              borrowingId: state.line.borrowingId,
              guestVisitId: state.line.borrowing.guestVisitId,
              status: "PENDING",
              method: "REPLACEMENT",
              ...details,
              photos: view.photos,
            },
          },
        });
        return { settlement: view, replayed: false };
      } catch (error) {
        knownRollback = true;
        throw error;
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });

    if (result.replayed) await cleanup();
    return result;
  } catch (error) {
    const knownPrismaRollback = error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2034"].includes(error.code);
    if (!transactionStarted || knownRollback || knownPrismaRollback) await cleanup();
    mapTransactionError(error);
  }
}
