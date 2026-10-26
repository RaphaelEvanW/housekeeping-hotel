import "server-only";

import { db } from "@/server/db";

export function getStockLocations() {
  return db.location.findMany({
    where: {
      isActive: true,
      code: { not: "WITH_GUEST" },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
}
