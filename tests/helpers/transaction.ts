import { db } from "../../src/server/db";
import type { Prisma } from "../../src/generated/prisma/client";

// Rollback keeps fixtures isolated, including immutable audit records.
export async function withRollback(work: (tx: Prisma.TransactionClient) => Promise<void>) {
  const rollback = new Error("rollback test fixtures");
  try {
    await db.$transaction(async (tx) => {
      await work(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
