import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type ItemUnit } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  borrowingLossReportIdSchema,
  decideBorrowingLossInputSchema,
  reportBorrowingLossInputSchema,
} from "@/server/borrowing-loss-input";

type BorrowingLossErrorCode =
  | "LINE_NOT_FOUND"
  | "LINE_NOT_OUTSTANDING"
  | "UNIT_STATE_CONFLICT"
  | "PENDING_REPORT_EXISTS"
  | "REPORT_NOT_FOUND"
  | "REPORT_NOT_PENDING"
  | "REPORT_NOT_APPROVED"
  | "SETTLEMENT_NOT_FOUND"
  | "SETTLEMENT_NOT_PENDING"
  | "PENDING_SETTLEMENT_EXISTS"
  | "ITEM_UNAVAILABLE"
  | "REQUEST_CONFLICT"
  | "RETRY_REQUIRED"
  | "STALE_UNIT"
  | "LOCATION_UNAVAILABLE"
  | "INVALID_TIME"
  | "PHOTOS_REQUIRED"
  | "CONDITION_CONFLICT";

export class BorrowingLossError extends Error {
  constructor(
    public readonly code: BorrowingLossErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BorrowingLossError";
  }
}

export const borrowingLossSettlementSelect = {
  id: true,
  lossReportId: true,
  status: true,
  method: true,
  amount: true,
  currencyCode: true,
  replacementItemId: true,
  replacementName: true,
  replacementSerialNumber: true,
  replacementCondition: true,
  receivedAt: true,
  replacementUnitId: true,
  replacementItem: { select: { id: true, name: true } },
  replacementUnit: {
    select: {
      id: true,
      itemId: true,
      unitNumber: true,
      name: true,
      serialNumber: true,
      condition: true,
      readiness: true,
      custody: true,
      locationId: true,
    },
  },
  photos: { orderBy: { id: "asc" }, select: { id: true } },
  notes: true,
  proposedAt: true,
  decidedAt: true,
  decisionNotes: true,
  proposedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.BorrowingLossSettlementSelect;

type Settlement = Prisma.BorrowingLossSettlementGetPayload<{
  select: typeof borrowingLossSettlementSelect;
}>;

export function borrowingLossSettlementView(settlement: Settlement) {
  return {
    ...settlement,
    amount: settlement.amount?.toString() ?? null,
    photos: settlement.photos.map((photo) => ({
      id: photo.id,
      url: `/api/borrowing-loss-reports/${settlement.lossReportId}/settlements/${settlement.id}/photos/${photo.id}`,
    })),
  };
}

export function borrowingLossReportView<T extends { settlements: Settlement[] }>(report: T) {
  const { settlements, ...details } = report;
  return { ...details, settlements: settlements.map(borrowingLossSettlementView) };
}

export const borrowingLossReportSelect = {
  id: true,
  borrowingLineId: true,
  status: true,
  notes: true,
  reportedAt: true,
  closedAt: true,
  closureNotes: true,
  reportedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  settlements: {
    orderBy: [{ proposedAt: "desc" }, { id: "desc" }],
    select: borrowingLossSettlementSelect,
  },
  borrowingLine: {
    select: {
      id: true,
      unitId: true,
      borrowingId: true,
      status: true,
      resolvedAt: true,
      resolutionMethod: true,
      borrowing: {
        select: {
          guestVisitId: true,
          primaryGuestNameSnapshot: true,
          roomNumberSnapshot: true,
        },
      },
    },
  },
} satisfies Prisma.BorrowingLossReportSelect;

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function lockRequest(tx: Prisma.TransactionClient, requestId: string) {
  const lockKey = `borrowing-loss:${requestId}`;
  await tx.$queryRaw`
    SELECT 1 AS locked
    FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;
}

export async function lockBorrowingLine(
  tx: Prisma.TransactionClient,
  borrowingLineId: string,
  expectedVisitId?: string,
) {
  const line = await tx.borrowingLine.findUnique({
    where: { id: borrowingLineId },
    select: {
      id: true,
      borrowingId: true,
      unitId: true,
      status: true,
      borrowing: {
        select: {
          guestVisitId: true,
          primaryGuestNameSnapshot: true,
          roomNumberSnapshot: true,
          issuedAt: true,
        },
      },
    },
  });

  if (!line || (expectedVisitId && line.borrowing.guestVisitId !== expectedVisitId)) {
    throw new BorrowingLossError(
      "LINE_NOT_FOUND",
      "Pinjaman unit tidak ditemukan pada kunjungan tamu ini.",
    );
  }

  const [visit] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "guest_visit"
    WHERE "id" = ${line.borrowing.guestVisitId}
    FOR SHARE
  `;
  if (!visit) {
    throw new BorrowingLossError(
      "LINE_NOT_FOUND",
      "Kunjungan tamu untuk pinjaman ini tidak ditemukan.",
    );
  }

  const [unit] = await tx.$queryRaw<
    Pick<
      ItemUnit,
      | "id"
      | "custody"
      | "condition"
      | "readiness"
      | "lossState"
      | "locationId"
      | "updatedAt"
    >[]
  >`
    SELECT "id", "custody", "condition", "readiness", "lossState",
           "locationId", "updatedAt"
    FROM "item_unit"
    WHERE "id" = ${line.unitId}
    FOR UPDATE
  `;
  const [lockedLine] = await tx.$queryRaw<
    {
      id: string;
      status: string;
      resolutionMethod: string | null;
    }[]
  >`
    SELECT "id", "status", "resolutionMethod"
    FROM "borrowing_line"
    WHERE "id" = ${line.id}
    FOR UPDATE
  `;

  if (!unit || !lockedLine) {
    throw new BorrowingLossError(
      "LINE_NOT_FOUND",
      "Unit atau pinjaman unit tidak ditemukan.",
    );
  }

  return {
    line,
    unit,
    status: lockedLine.status,
    resolutionMethod: lockedLine.resolutionMethod,
  };
}

function assertReportable(state: {
  status: string;
  unit: { custody: string; lossState: string };
}) {
  if (state.status !== "OUTSTANDING") {
    throw new BorrowingLossError(
      "LINE_NOT_OUTSTANDING",
      "Laporan kehilangan hanya dapat dibuat untuk pinjaman yang belum dikembalikan.",
    );
  }
  if (state.unit.custody !== "GUEST" || state.unit.lossState !== "NONE") {
    throw new BorrowingLossError(
      "UNIT_STATE_CONFLICT",
      "Kondisi unit sudah berubah dan tidak dapat dilaporkan sebagai kehilangan baru.",
    );
  }
}

export function mapTransactionError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new BorrowingLossError(
        "REQUEST_CONFLICT",
        "ID permintaan sudah digunakan atau laporan kehilangan aktif sudah ada.",
      );
    }
    if (error.code === "P2034") {
      throw new BorrowingLossError(
        "RETRY_REQUIRED",
        "Data sedang berubah. Ulangi dengan ID permintaan yang sama.",
      );
    }
  }
  throw error;
}

export async function reportBorrowingLoss(
  rawInput: unknown,
  actorId: string,
) {
  const input = reportBorrowingLossInputSchema.parse(rawInput);
  const requestHash = hash({
    guestVisitId: input.guestVisitId,
    borrowingLineId: input.borrowingLineId,
    notes: input.notes,
  });

  try {
    return await db.$transaction(
      async (tx) => {
        await lockRequest(tx, input.requestId);

        const existing = await tx.borrowingLossReport.findUnique({
          where: { id: input.requestId },
          select: {
            ...borrowingLossReportSelect,
            requestHash: true,
            reportedById: true,
          },
        });
        if (existing) {
          const {
            requestHash: savedHash,
            reportedById,
            ...report
          } = existing;
          if (
            reportedById !== actorId ||
            savedHash !== requestHash
          ) {
            throw new BorrowingLossError(
              "REQUEST_CONFLICT",
              "ID permintaan sudah digunakan untuk laporan lain.",
            );
          }
          return { report: borrowingLossReportView(report), replayed: true };
        }

        const state = await lockBorrowingLine(
          tx,
          input.borrowingLineId,
          input.guestVisitId,
        );
        assertReportable(state);

        const active = await tx.borrowingLossReport.findFirst({
          where: {
            borrowingLineId: input.borrowingLineId,
            status: { in: ["PENDING", "APPROVED"] },
          },
          select: { id: true },
        });
        if (active) {
          throw new BorrowingLossError(
            "PENDING_REPORT_EXISTS",
            "Pinjaman ini sudah memiliki laporan kehilangan yang belum selesai.",
          );
        }

        const report = await tx.borrowingLossReport.create({
          data: {
            id: input.requestId,
            borrowingLineId: state.line.id,
            notes: input.notes,
            requestHash,
            reportedById: actorId,
          },
          select: borrowingLossReportSelect,
        });

        await tx.auditEvent.create({
          data: {
            id: input.requestId,
            actorId,
            action: "BORROWING_LOSS_REPORTED",
            entityType: "ITEM_UNIT",
            entityId: state.unit.id,
            reason: input.notes,
            newValues: {
              lossReportId: report.id,
              status: report.status,
              borrowingLineId: state.line.id,
              borrowingId: state.line.borrowingId,
              guestVisitId: state.line.borrowing.guestVisitId,
              primaryGuestNameSnapshot:
                state.line.borrowing.primaryGuestNameSnapshot,
              roomNumberSnapshot: state.line.borrowing.roomNumberSnapshot,
            },
          },
        });

        return { report: borrowingLossReportView(report), replayed: false };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15_000,
      },
    );
  } catch (error) {
    mapTransactionError(error);
  }
}

export async function decideBorrowingLoss(
  reportId: string,
  rawInput: unknown,
  actorId: string,
) {
  const id = borrowingLossReportIdSchema.parse(reportId);
  const input = decideBorrowingLossInputSchema.parse(rawInput);
  const status = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const action = `BORROWING_LOSS_${status}`;
  const requestHash = hash({ reportId: id, decision: input.decision, notes: input.notes });

  try {
    return await db.$transaction(
      async (tx) => {
        await lockRequest(tx, input.requestId);

        const priorDecision = await tx.auditEvent.findUnique({
          where: { id: input.requestId },
          select: {
            actorId: true,
            action: true,
            entityType: true,
            entityId: true,
            newValues: true,
          },
        });
        if (priorDecision) {
          const values = priorDecision.newValues;
          if (
            priorDecision.actorId !== actorId ||
            priorDecision.action !== action ||
            priorDecision.entityType !== "ITEM_UNIT" ||
            !values ||
            typeof values !== "object" ||
            Array.isArray(values) ||
            values.lossReportId !== id ||
            values.requestHash !== requestHash
          ) {
            throw new BorrowingLossError(
              "REQUEST_CONFLICT",
              "ID permintaan sudah digunakan untuk keputusan lain.",
            );
          }
          const report = await tx.borrowingLossReport.findUnique({
            where: { id },
            select: borrowingLossReportSelect,
          });
          if (!report || report.borrowingLine.unitId !== priorDecision.entityId) {
            throw new BorrowingLossError(
              "REPORT_NOT_FOUND",
              "Laporan kehilangan tidak ditemukan.",
            );
          }
          return { report: borrowingLossReportView(report), replayed: true };
        }

        const candidate = await tx.borrowingLossReport.findUnique({
          where: { id },
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
          WHERE "id" = ${id}
          FOR UPDATE
        `;
        const report = await tx.borrowingLossReport.findUnique({
          where: { id },
          select: borrowingLossReportSelect,
        });
        if (!report) {
          throw new BorrowingLossError(
            "REPORT_NOT_FOUND",
            "Laporan kehilangan tidak ditemukan.",
          );
        }
        if (report.status !== "PENDING") {
          throw new BorrowingLossError(
            "REPORT_NOT_PENDING",
            "Laporan ini sudah ditutup dan tidak dapat diputuskan lagi.",
          );
        }
        if (status === "APPROVED") assertReportable(state);

        const closedAt = new Date();
        const updatedReport = await tx.borrowingLossReport.update({
          where: { id },
          data: {
            status,
            closedById: actorId,
            closedAt,
            closureNotes: input.notes,
          },
          select: borrowingLossReportSelect,
        });

        if (status === "APPROVED") {
          await tx.itemUnit.update({
            where: { id: state.unit.id },
            data: {
              lossState: "LOST",
              readiness: "ON_HOLD",
              updatedById: actorId,
            },
          });
        }

        await tx.auditEvent.create({
          data: {
            id: input.requestId,
            actorId,
            action,
            entityType: "ITEM_UNIT",
            entityId: state.unit.id,
            reason: input.notes,
            oldValues: {
              status: "PENDING",
              lossState: state.unit.lossState,
              readiness: state.unit.readiness,
            },
            newValues: {
              lossReportId: id,
              status,
              borrowingLineId: state.line.id,
              borrowingId: state.line.borrowingId,
              guestVisitId: state.line.borrowing.guestVisitId,
              ...(status === "APPROVED"
                ? { lossState: "LOST", readiness: "ON_HOLD" }
                : {}),
              requestHash,
            },
          },
        });

        return { report: borrowingLossReportView(updatedReport), replayed: false };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15_000,
      },
    );
  } catch (error) {
    mapTransactionError(error);
  }
}

export async function getBorrowingLossReport(rawReportId: unknown) {
  const id = borrowingLossReportIdSchema.parse(rawReportId);
  const report = await db.borrowingLossReport.findUnique({
    where: { id },
    select: borrowingLossReportSelect,
  });
  return report ? borrowingLossReportView(report) : null;
}

export async function cancelPendingBorrowingLossReports(
  tx: Prisma.TransactionClient,
  borrowingLineIds: string[],
  actorId: string,
  closedAt: Date,
  returnBatchId: string,
) {
  const pending = await tx.borrowingLossReport.findMany({
    where: {
      borrowingLineId: { in: borrowingLineIds },
      status: "PENDING",
    },
    select: {
      id: true,
      borrowingLineId: true,
      borrowingLine: {
        select: {
          unitId: true,
          borrowingId: true,
          borrowing: { select: { guestVisitId: true } },
        },
      },
    },
  });
  if (pending.length === 0) return;

  const result = await tx.borrowingLossReport.updateMany({
    where: {
      id: { in: pending.map((report) => report.id) },
      status: "PENDING",
    },
    data: {
      status: "CANCELLED",
      closedById: actorId,
      closedAt,
      closureNotes: "Unit diterima melalui pengembalian.",
    },
  });
  if (result.count !== pending.length) {
    throw new Error("Laporan kehilangan berubah di luar urutan pengembalian.");
  }

  await tx.auditEvent.createMany({
    data: pending.map((report) => ({
      actorId,
      action: "BORROWING_LOSS_CANCELLED",
      entityType: "ITEM_UNIT",
      entityId: report.borrowingLine.unitId,
      reason: "Unit diterima melalui pengembalian.",
      oldValues: { status: "PENDING" },
      newValues: {
        lossReportId: report.id,
        status: "CANCELLED",
        borrowingLineId: report.borrowingLineId,
        borrowingId: report.borrowingLine.borrowingId,
        guestVisitId: report.borrowingLine.borrowing.guestVisitId,
        returnBatchId,
        closedAt: closedAt.toISOString(),
      },
    })),
  });
}
