import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { borrowingLossReportSelect, borrowingLossReportView } from "@/server/borrowing-loss";
import { listBorrowingLossReportsInputSchema } from "@/server/borrowing-loss-input";

export async function listBorrowingLossReports(rawInput: unknown) {
  const { page, pageSize, q, status } =
    listBorrowingLossReportsInputSchema.parse(rawInput);
  const search = q.replace(/[\\%_]/gu, "\\$&");
  const contains = { contains: search, mode: "insensitive" as const };
  const where: Prisma.BorrowingLossReportWhereInput = {
    ...(status === "ALL" ? {} : { status }),
    ...(q
      ? {
          borrowingLine: {
            OR: [
              { borrowing: { primaryGuestNameSnapshot: contains } },
              { borrowing: { roomNumberSnapshot: contains } },
              { unit: { name: contains } },
              { unit: { serialNumber: contains } },
              { unit: { item: { name: contains } } },
            ],
          },
        }
      : {}),
  };

  const [reports, total] = await db.$transaction(
    [
      db.borrowingLossReport.findMany({
        where,
        orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...borrowingLossReportSelect,
          borrowingLine: {
            select: {
              ...borrowingLossReportSelect.borrowingLine.select,
              unit: {
                select: {
                  id: true,
                  unitNumber: true,
                  name: true,
                  serialNumber: true,
                  item: { select: { id: true, name: true, isActive: true } },
                },
              },
            },
          },
        },
      }),
      db.borrowingLossReport.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  return {
    lossReports: reports.map((report) => ({
      ...borrowingLossReportView(report),
      borrowingLine: {
        ...report.borrowingLine,
        unit: {
          ...report.borrowingLine.unit,
          unitCode: `HK-${String(report.borrowingLine.unit.unitNumber).padStart(6, "0")}`,
        },
      },
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
    },
  };
}
