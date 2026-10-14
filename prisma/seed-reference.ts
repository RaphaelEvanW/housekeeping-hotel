import type { Prisma } from "../src/generated/prisma/client";

export async function seedReferenceData(tx: Prisma.TransactionClient) {
  // Skip existing codes so reruns never overwrite operational edits or assignments.
  await tx.role.createMany({
    data: [
      { code: "HK_STAFF", name: "Housekeeping Staff" },
      { code: "HK_SUPERVISOR", name: "HK Supervisor" },
      { code: "MANAGEMENT", name: "Management" },
      { code: "SYSTEM_ADMIN", name: "System Admin / IT" },
    ],
    skipDuplicates: true,
  });
  await tx.location.createMany({
    data: [{ code: "HK_MAIN_STORAGE", name: "HK Main Storage" }],
    skipDuplicates: true,
  });
}
