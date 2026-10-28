import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  BorrowingLossError,
  borrowingLossSettlementSelect,
  borrowingLossSettlementView as settlementView,
  lockBorrowingLine,
  lockRequest,
  mapTransactionError,
} from "@/server/borrowing-loss";
import { borrowingLossReportIdSchema } from "@/server/borrowing-loss-input";
import {
  decideSettlementInputSchema,
  decideWriteOffInputSchema,
  lossSettlementIdSchema,
  proposeCompensationInputSchema,
  proposeWriteOffInputSchema,
} from "@/server/borrowing-loss-settlement-input";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type Settlement = Prisma.BorrowingLossSettlementGetPayload<{
  select: typeof borrowingLossSettlementSelect;
}>;

export async function lockReport(tx: Prisma.TransactionClient, reportId: string) {
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
    WHERE "id" = ${reportId} FOR UPDATE
  `;
  const report = await tx.borrowingLossReport.findUniqueOrThrow({
    where: { id: reportId },
    select: { status: true },
  });
  if (report.status !== "APPROVED") {
    throw new BorrowingLossError(
      "REPORT_NOT_APPROVED",
      "Penyelesaian hanya dapat diajukan setelah laporan kehilangan disetujui.",
    );
  }
  return state;
}

export function assertUnresolvedLoss(
  state: Awaited<ReturnType<typeof lockBorrowingLine>>,
) {
  if (state.status !== "OUTSTANDING") {
    throw new BorrowingLossError(
      "LINE_NOT_OUTSTANDING",
      "Kewajiban pinjaman unit ini sudah diselesaikan.",
    );
  }
  if (state.unit.lossState !== "LOST" || state.unit.custody !== "GUEST") {
    throw new BorrowingLossError(
      "UNIT_STATE_CONFLICT",
      "Status unit telah berubah. Muat ulang data sebelum melanjutkan.",
    );
  }
}

export async function assertNoPendingSettlement(tx: Prisma.TransactionClient, reportId: string) {
  const pending = await tx.borrowingLossSettlement.findFirst({
    where: { lossReportId: reportId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) {
    throw new BorrowingLossError(
      "PENDING_SETTLEMENT_EXISTS",
      "Masih ada pengajuan penyelesaian kehilangan yang menunggu keputusan.",
    );
  }
}

export async function assertReplacementItem(tx: Prisma.TransactionClient, itemId: string) {
  const [item] = await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
    SELECT "id", "isActive" FROM "item" WHERE "id" = ${itemId} FOR SHARE
  `;
  if (!item?.isActive) {
    throw new BorrowingLossError("ITEM_UNAVAILABLE", "Jenis barang pengganti tidak tersedia atau sudah nonaktif.");
  }
}

async function createReplacementUnit(
  tx: Prisma.TransactionClient,
  settlement: Settlement,
  state: Awaited<ReturnType<typeof lockBorrowingLine>>,
  actorId: string,
) {
  if (!settlement.replacementItemId || !settlement.replacementCondition || !settlement.receivedAt) {
    throw new BorrowingLossError("UNIT_STATE_CONFLICT", "Data penerimaan barang pengganti belum lengkap.");
  }
  await assertReplacementItem(tx, settlement.replacementItemId);
  const [storage] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "location"
    WHERE "code" = 'HK_MAIN_STORAGE' AND "isActive" = true FOR SHARE
  `;
  if (!storage) {
    throw new BorrowingLossError("LOCATION_UNAVAILABLE", "Lokasi HK Main Storage belum tersedia atau sudah nonaktif.");
  }
  const photos = await tx.borrowingLossSettlementPhoto.findMany({
    where: { settlementId: settlement.id }, select: { photoKey: true },
  });
  if (!photos.length) {
    throw new BorrowingLossError("PHOTOS_REQUIRED", "Foto bukti barang pengganti belum tersedia.");
  }
  const unit = await tx.itemUnit.create({
    data: {
      itemId: settlement.replacementItemId,
      name: settlement.replacementName,
      serialNumber: settlement.replacementSerialNumber,
      notes: settlement.notes,
      condition: settlement.replacementCondition,
      readiness: settlement.replacementCondition === "GOOD" ? "CLEAR" : "PENDING_INSPECTION",
      lifecycle: "ACTIVE",
      custody: "HOUSEKEEPING",
      lossState: "NONE",
      locationId: storage.id,
      createdById: actorId,
      updatedById: actorId,
    },
  });
  const event = await tx.auditEvent.create({
    data: {
      actorId,
      action: "STOCK_UNIT_CREATED",
      entityType: "ITEM_UNIT",
      entityId: unit.id,
      reason: settlement.notes,
      newValues: {
        source: "REPLACEMENT",
        settlementId: settlement.id,
        lossReportId: settlement.lossReportId,
        originalUnitId: state.unit.id,
        borrowingLineId: state.line.id,
        itemId: unit.itemId,
        unitNumber: unit.unitNumber,
        name: unit.name,
        serialNumber: unit.serialNumber,
        notes: unit.notes,
        locationId: unit.locationId,
        condition: unit.condition,
        readiness: unit.readiness,
        lifecycle: unit.lifecycle,
        custody: unit.custody,
        lossState: unit.lossState,
        receivedAt: settlement.receivedAt.toISOString(),
        receivedById: settlement.proposedBy.id,
      },
    },
  });
  // The received replacement and its initial unit evidence share immutable photo bytes.
  await tx.itemUnitPhoto.createMany({
    data: photos.map(({ photoKey }) => ({ unitId: unit.id, auditEventId: event.id, photoKey })),
  });
  return unit.id;
}

export async function proposeCompensation(
  rawReportId: unknown,
  rawInput: unknown,
  actorId: string,
) {
  const reportId = borrowingLossReportIdSchema.parse(rawReportId);
  const input = proposeCompensationInputSchema.parse(rawInput);
  const amount = new Prisma.Decimal(input.amount);
  const requestHash = hash({
    reportId,
    amount: amount.toString(),
    currencyCode: input.currencyCode,
    notes: input.notes,
  });

  return proposeSimpleSettlement(reportId, input.requestId, {
    method: "COMPENSATION", amount, currencyCode: input.currencyCode, notes: input.notes,
  }, actorId, requestHash);
}

export async function proposeWriteOff(
  rawReportId: unknown,
  rawInput: unknown,
  actorId: string,
) {
  const reportId = borrowingLossReportIdSchema.parse(rawReportId);
  const input = proposeWriteOffInputSchema.parse(rawInput);
  const requestHash = hash({ reportId, method: "WRITE_OFF", notes: input.notes });
  return proposeSimpleSettlement(reportId, input.requestId, {
    method: "WRITE_OFF", amount: null, currencyCode: null, notes: input.notes,
  }, actorId, requestHash);
}

async function proposeSimpleSettlement(
  reportId: string,
  requestId: string,
  details:
    | { method: "COMPENSATION"; amount: Prisma.Decimal; currencyCode: string; notes: string }
    | { method: "WRITE_OFF"; amount: null; currencyCode: null; notes: string },
  actorId: string,
  requestHash: string,
) {
  try {
    return await db.$transaction(async (tx) => {
      await lockRequest(tx, requestId);
      const prior = await tx.borrowingLossSettlement.findUnique({
        where: { id: requestId },
        select: {
          ...borrowingLossSettlementSelect,
          requestHash: true,
          proposedById: true,
        },
      });
      if (prior) {
        const { requestHash: savedHash, proposedById, ...settlement } = prior;
        if (
          savedHash !== requestHash ||
          proposedById !== actorId ||
          prior.lossReportId !== reportId ||
          prior.method !== details.method
        ) {
          throw new BorrowingLossError(
            "REQUEST_CONFLICT",
            "ID permintaan sudah digunakan untuk pengajuan lain.",
          );
        }
        return { settlement: settlementView(settlement), replayed: true };
      }

      const state = await lockReport(tx, reportId);
      assertUnresolvedLoss(state);
      await assertNoPendingSettlement(tx, reportId);

      const settlement = await tx.borrowingLossSettlement.create({
        data: {
          id: requestId,
          lossReportId: reportId,
          ...details,
          requestHash,
          proposedById: actorId,
        },
        select: borrowingLossSettlementSelect,
      });
      await tx.auditEvent.create({
        data: {
          id: requestId,
          actorId,
          action: `BORROWING_${details.method}_PROPOSED`,
          entityType: "ITEM_UNIT",
          entityId: state.unit.id,
          reason: details.notes,
          newValues: {
            settlementId: settlement.id,
            lossReportId: reportId,
            borrowingLineId: state.line.id,
            borrowingId: state.line.borrowingId,
            guestVisitId: state.line.borrowing.guestVisitId,
            status: "PENDING",
            method: details.method,
            amount: details.amount?.toString() ?? null,
            currencyCode: details.currencyCode,
          },
        },
      });
      return { settlement: settlementView(settlement), replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
  } catch (error) {
    mapTransactionError(error);
  }
}

export async function decideCompensation(
  rawReportId: unknown,
  rawSettlementId: unknown,
  rawInput: unknown,
  actorId: string,
) {
  return decideSettlement(rawReportId, rawSettlementId, rawInput, actorId, "COMPENSATION");
}

export async function decideReplacement(
  rawReportId: unknown,
  rawSettlementId: unknown,
  rawInput: unknown,
  actorId: string,
) {
  return decideSettlement(rawReportId, rawSettlementId, rawInput, actorId, "REPLACEMENT");
}

export async function decideWriteOff(
  rawReportId: unknown,
  rawSettlementId: unknown,
  rawInput: unknown,
  actorId: string,
) {
  return decideSettlement(rawReportId, rawSettlementId, rawInput, actorId, "WRITE_OFF");
}

async function decideSettlement(
  rawReportId: unknown,
  rawSettlementId: unknown,
  rawInput: unknown,
  actorId: string,
  method: "COMPENSATION" | "REPLACEMENT" | "WRITE_OFF",
) {
  const reportId = borrowingLossReportIdSchema.parse(rawReportId);
  const settlementId = lossSettlementIdSchema.parse(rawSettlementId);
  const input = (method === "WRITE_OFF" ? decideWriteOffInputSchema : decideSettlementInputSchema).parse(rawInput);
  const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const action = `BORROWING_${method}_${status}`;
  const requestHash = hash({
    reportId,
    settlementId,
    decision: input.decision,
    notes: input.notes,
  });

  try {
    return await db.$transaction(async (tx) => {
      await lockRequest(tx, input.requestId);
      const prior = await tx.auditEvent.findUnique({
        where: { id: input.requestId },
        select: {
          actorId: true,
          action: true,
          entityType: true,
          newValues: true,
        },
      });
      if (prior) {
        const values = prior.newValues;
        if (
          prior.actorId !== actorId ||
          prior.action !== action ||
          prior.entityType !== "ITEM_UNIT" ||
          !values ||
          typeof values !== "object" ||
          Array.isArray(values) ||
          values.lossReportId !== reportId ||
          values.settlementId !== settlementId ||
          values.requestHash !== requestHash
        ) {
          throw new BorrowingLossError(
            "REQUEST_CONFLICT",
            "ID permintaan sudah digunakan untuk keputusan lain.",
          );
        }
        const settlement = await tx.borrowingLossSettlement.findUniqueOrThrow({
          where: { id: settlementId },
          select: borrowingLossSettlementSelect,
        });
        return { settlement: settlementView(settlement), replayed: true };
      }

      const candidate = await tx.borrowingLossSettlement.findUnique({
        where: { id: settlementId },
        select: { lossReportId: true, method: true },
      });
      if (!candidate || candidate.lossReportId !== reportId || candidate.method !== method) {
        throw new BorrowingLossError(
          "SETTLEMENT_NOT_FOUND",
          "Pengajuan penyelesaian tidak ditemukan pada laporan ini.",
        );
      }
      const state = await lockReport(tx, reportId);
      await tx.$queryRaw`
        SELECT "id" FROM "borrowing_loss_settlement"
        WHERE "id" = ${settlementId} FOR UPDATE
      `;
      const current = await tx.borrowingLossSettlement.findUniqueOrThrow({
        where: { id: settlementId },
        select: borrowingLossSettlementSelect,
      });
      if (current.status !== "PENDING") {
        throw new BorrowingLossError(
          "SETTLEMENT_NOT_PENDING",
          "Pengajuan penyelesaian ini sudah diputuskan.",
        );
      }
      if (status === "APPROVED") assertUnresolvedLoss(state);

      const decidedAt = new Date();
      const replacementUnitId = status === "APPROVED" && method === "REPLACEMENT"
        ? await createReplacementUnit(tx, current, state, actorId)
        : null;
      const settlement = await tx.borrowingLossSettlement.update({
        where: { id: settlementId },
        data: {
          status,
          decidedAt,
          decidedById: actorId,
          decisionNotes: input.notes,
          replacementUnitId,
        },
        select: borrowingLossSettlementSelect,
      });
      if (status === "APPROVED") {
        const resolved = await tx.borrowingLine.updateMany({
          where: { id: state.line.id, status: "OUTSTANDING" },
          data: {
            status: "SETTLED",
            resolvedAt: decidedAt,
            resolutionMethod: method,
          },
        });
        if (resolved.count !== 1) {
          throw new BorrowingLossError(
            "LINE_NOT_OUTSTANDING",
            "Kewajiban pinjaman unit ini sudah diselesaikan.",
          );
        }
      }
      await tx.auditEvent.create({
        data: {
          id: input.requestId,
          actorId,
          action,
          entityType: "ITEM_UNIT",
          entityId: state.unit.id,
          reason: input.notes,
          oldValues: { status: "PENDING", borrowingStatus: state.status },
          newValues: {
            settlementId,
            lossReportId: reportId,
            borrowingLineId: state.line.id,
            borrowingId: state.line.borrowingId,
            guestVisitId: state.line.borrowing.guestVisitId,
            status,
            method,
            amount: current.amount?.toString() ?? null,
            currencyCode: current.currencyCode,
            ...(method === "REPLACEMENT" ? { replacementUnitId, replacementItemId: current.replacementItemId, replacementCondition: current.replacementCondition } : {}),
            borrowingStatus: status === "APPROVED" ? "SETTLED" : state.status,
            ...(status === "APPROVED" ? { resolutionMethod: method } : {}),
            requestHash,
          },
        },
      });
      return { settlement: settlementView(settlement), replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });
  } catch (error) {
    mapTransactionError(error);
  }
}
