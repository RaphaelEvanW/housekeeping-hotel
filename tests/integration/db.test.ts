import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/server/db";

const table = `toolchain_probe_${randomUUID().replaceAll("-", "")}`;
let created = false;

describe("PostgreSQL through the application Prisma client", () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<{ database: string; username: string }[]>`
      SELECT current_database() AS database, current_user AS username
    `;
    expect(identity).toEqual([
      { database: "housekeeping_test", username: "housekeeping_test" },
    ]);
    // The identifier is generated locally, never supplied by a user.
    await db.$executeRawUnsafe(`CREATE TABLE "${table}" (value text NOT NULL)`);
    created = true;
  });

  afterAll(async () => {
    try {
      if (created) await db.$executeRawUnsafe(`DROP TABLE "${table}"`);
    } finally {
      await db.$disconnect();
    }
  });

  it("connects to the dedicated test database", async () => {
    expect(await db.$queryRaw`SELECT 1 AS connected`).toEqual([{ connected: 1 }]);
  });

  it("commits successful writes", async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`INSERT INTO "${table}" (value) VALUES ($1)`, "committed");
    });
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM "${table}" WHERE value = $1`,
      "committed",
    );
    expect(rows).toEqual([{ value: "committed" }]);
  });

  it("rolls back writes when the transaction fails", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`INSERT INTO "${table}" (value) VALUES ($1)`, "rolled-back");
        const rows = await tx.$queryRawUnsafe<{ value: string }[]>(
          `SELECT value FROM "${table}" WHERE value = $1`,
          "rolled-back",
        );
        expect(rows).toEqual([{ value: "rolled-back" }]);
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");

    expect(
      await db.$queryRawUnsafe(`SELECT value FROM "${table}" WHERE value = $1`, "rolled-back"),
    ).toEqual([]);
  });
});
