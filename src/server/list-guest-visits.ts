import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { guestVisitSelect } from "@/server/guest-visits";
import { listGuestVisitsInputSchema } from "@/server/list-guest-visits-input";

export async function listGuestVisits(rawInput: unknown) {
  const { page, pageSize, q, status } = listGuestVisitsInputSchema.parse(rawInput);
  const search = q.replace(/[\\%_]/gu, "\\$&");
  const where: Prisma.GuestVisitWhereInput = {
    ...(status === "ALL" ? {} : { status }),
    ...(q ? {
      OR: [
        { normalizedPrimaryGuestName: { contains: search } },
        { roomNumber: { contains: search, mode: "insensitive" } },
        { bookingNumber: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [visits, total] = await db.$transaction([
    db.guestVisit.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: guestVisitSelect,
    }),
    db.guestVisit.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  return {
    visits,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
    },
  };
}
