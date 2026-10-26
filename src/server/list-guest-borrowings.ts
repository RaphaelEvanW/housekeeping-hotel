import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { guestVisitSelect } from "@/server/guest-visits";
import { listGuestBorrowingsInputSchema } from "@/server/list-guest-borrowings-input";

export async function listGuestBorrowings(rawInput: unknown) {
  const { visitId, status, page, pageSize } =
    listGuestBorrowingsInputSchema.parse(rawInput);

  return db.$transaction(
    async (tx) => {
      const visit = await tx.guestVisit.findUnique({
        where: { id: visitId },
        select: guestVisitSelect,
      });

      if (!visit) return null;

      const visitWhere: Prisma.BorrowingLineWhereInput = {
        borrowing: { guestVisitId: visitId },
      };
      const groupedCounts = await tx.borrowingLine.groupBy({
        by: ["status"],
        where: visitWhere,
        _count: { _all: true },
      });
      const counts = {
        OUTSTANDING: 0,
        RETURNED: 0,
        SETTLED: 0,
      };

      for (const group of groupedCounts) {
        counts[group.status] = group._count._all;
      }

      const totalLines =
        counts.OUTSTANDING + counts.RETURNED + counts.SETTLED;
      const total = status === "ALL" ? totalLines : counts[status];
      const totalOccasions = await tx.borrowing.count({
        where: { guestVisitId: visitId },
      });
      const lines = await tx.borrowingLine.findMany({
        where: {
          ...visitWhere,
          ...(status === "ALL" ? {} : { status }),
        },
        orderBy: [
          { borrowing: { issuedAt: "desc" } },
          { borrowingId: "desc" },
          { id: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          conditionAtIssue: true,
          resolvedAt: true,
          borrowing: {
            select: {
              id: true,
              issuedAt: true,
              primaryGuestNameSnapshot: true,
              roomNumberSnapshot: true,
              issuedBy: { select: { id: true, name: true } },
            },
          },
          unit: {
            select: {
              id: true,
              unitNumber: true,
              name: true,
              serialNumber: true,
              condition: true,
              lifecycle: true,
              custody: true,
              readiness: true,
              lossState: true,
              location: { select: { id: true, code: true, name: true } },
              item: { select: { id: true, name: true, isActive: true } },
            },
          },
          photos: {
            orderBy: [{ auditEvent: { createdAt: "asc" } }, { id: "asc" }],
            select: {
              id: true,
              auditEvent: {
                select: { id: true, action: true, createdAt: true },
              },
            },
          },
        },
      });

      return {
        visit,
        summary: {
          totalOccasions,
          totalLines,
          outstandingLines: counts.OUTSTANDING,
          returnedLines: counts.RETURNED,
          settledLines: counts.SETTLED,
          hasOutstanding: counts.OUTSTANDING > 0,
        },
        lines: lines.map((line) => ({
          ...line,
          unit: {
            ...line.unit,
            unitCode: `HK-${String(line.unit.unitNumber).padStart(6, "0")}`,
          },
          photos: line.photos.map((photo) => ({
            id: photo.id,
            event: photo.auditEvent,
            url: `/api/item-units/${line.unit.id}/photos/${photo.id}`,
          })),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: page * pageSize < total,
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
