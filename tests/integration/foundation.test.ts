import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "../../src/server/db";
import type { Prisma } from "../../src/generated/prisma/client";
import { withRollback } from "../helpers/transaction";

const createUser = (tx: Prisma.TransactionClient) => tx.user.create({
  data: { name: "Test operator", email: `${randomUUID()}@example.test` },
});

afterAll(() => db.$disconnect());

it("has exactly the eight foundation tables, without operational business tables", async () => {
  const rows = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
      AND table_name NOT LIKE 'toolchain_probe_%'
    ORDER BY table_name
  `;
  expect(rows.map((row) => row.table_name)).toEqual([
    "account", "audit_event", "location", "role", "session", "user", "user_role", "verification",
  ]);
});

it("supports real Better Auth adapter CRUD and session-to-user joins", async () => {
  await withRollback(async (tx) => {
    const adapter = prismaAdapter(tx, { provider: "postgresql" })({});
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);
    const user = await adapter.create<{ id: string }>({
      model: "user",
      data: { name: "Adapter fixture", email: `${randomUUID()}@example.test`, emailVerified: false },
    });
    const session = await adapter.create<{ id: string }>({
      model: "session",
      data: { userId: user.id, token: randomUUID(), expiresAt, updatedAt: now },
    });
    await adapter.create({
      model: "account",
      data: { userId: user.id, providerId: "credential", accountId: user.id, updatedAt: now },
    });
    const verification = await adapter.create<{ id: string }>({
      model: "verification",
      data: { identifier: randomUUID(), value: "test-only-verification", expiresAt },
    });
    const joined = await adapter.findOne({
      model: "session", where: [{ field: "id", value: session.id }], join: { user: true },
    });
    expect(joined).toMatchObject({ userId: user.id, user: { id: user.id } });
    await adapter.update({
      model: "user", where: [{ field: "id", value: user.id }], update: { name: "Updated fixture" },
    });
    expect(await tx.user.findUnique({ where: { id: user.id } })).toMatchObject({
      name: "Updated fixture", isActive: true,
    });
    await adapter.delete({ model: "verification", where: [{ field: "id", value: verification.id }] });
    expect(await tx.verification.count()).toBe(0);
  });
});

it("rejects duplicate user emails", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    await tx.user.create({ data: { name: "Duplicate", email: user.email } });
  })).rejects.toMatchObject({ code: "P2002" });
});

it("rejects duplicate session tokens", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    const data = { userId: user.id, token: randomUUID(), expiresAt: new Date() };
    await tx.session.create({ data });
    await tx.session.create({ data });
  })).rejects.toMatchObject({ code: "P2002" });
});

it("rejects linking the same provider account to different users", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    const other = await createUser(tx);
    const accountId = randomUUID();
    await tx.account.create({ data: { userId: user.id, providerId: "credential", accountId } });
    await tx.account.create({ data: { userId: other.id, providerId: "credential", accountId } });
  })).rejects.toMatchObject({ code: "P2002" });
});

it.each(["session", "account", "userRole", "auditEvent"] as const)(
  "rejects %s records referencing a nonexistent user",
  async (model) => {
    await expect(withRollback(async (tx) => {
      const userId = randomUUID();
      if (model === "session") await tx.session.create({
        data: { userId, token: randomUUID(), expiresAt: new Date() },
      });
      if (model === "account") await tx.account.create({
        data: { userId, providerId: "credential", accountId: randomUUID() },
      });
      if (model === "userRole") {
        const role = await tx.role.upsert({
          where: { code: "HK_STAFF" }, update: {}, create: { code: "HK_STAFF", name: "Staff" },
        });
        await tx.userRole.create({ data: { userId, roleId: role.id } });
      }
      if (model === "auditEvent") await tx.auditEvent.create({
        data: { actorId: userId, action: "TEST", entityType: "User", entityId: userId },
      });
    })).rejects.toMatchObject({ code: "P2003" });
  },
);

it("does not infer business roles from SYSTEM_ADMIN assignments", async () => {
  await withRollback(async (tx) => {
    const user = await createUser(tx);
    const role = await tx.role.upsert({
      where: { code: "SYSTEM_ADMIN" }, update: {}, create: { code: "SYSTEM_ADMIN", name: "IT" },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const assignments = await tx.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
    expect(assignments.map((assignment) => assignment.role.code)).toEqual(["SYSTEM_ADMIN"]);
  });
});

it("rejects duplicate role assignments", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    const role = await tx.role.upsert({
      where: { code: "HK_STAFF" }, update: {}, create: { code: "HK_STAFF", name: "Staff" },
    });
    const data = { userId: user.id, roleId: role.id };
    await tx.userRole.create({ data });
    await tx.userRole.create({ data });
  })).rejects.toMatchObject({ code: "P2002" });
});

it("rejects nonexistent role assignments", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    await tx.userRole.create({ data: { userId: user.id, roleId: randomUUID() } });
  })).rejects.toMatchObject({ code: "P2003" });
});

it("rejects duplicate reference codes", async () => {
  await expect(withRollback(async (tx) => {
    const data = { code: `test_${randomUUID()}`, name: "Fixture storage" };
    await tx.location.create({ data });
    await tx.location.create({ data });
  })).rejects.toMatchObject({ code: "P2002" });
});

it("rejects duplicate predefined role codes", async () => {
  await expect(withRollback(async (tx) => {
    await tx.role.upsert({
      where: { code: "HK_STAFF" }, update: {}, create: { code: "HK_STAFF", name: "Staff" },
    });
    await tx.role.create({ data: { code: "HK_STAFF", name: "Duplicate staff" } });
  })).rejects.toMatchObject({ code: "P2002" });
});

it("prevents deleting a role while it is assigned", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    const role = await tx.role.upsert({
      where: { code: "MANAGEMENT" }, update: {}, create: { code: "MANAGEMENT", name: "Management" },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await tx.role.delete({ where: { id: role.id } });
  })).rejects.toMatchObject({ code: "P2003" });
});

it("allows multiple verification records for one identifier as required by Better Auth", async () => {
  await withRollback(async (tx) => {
    const identifier = randomUUID();
    await tx.verification.createMany({
      data: [
        { identifier, value: "first-test-value", expiresAt: new Date() },
        { identifier, value: "second-test-value", expiresAt: new Date() },
      ],
    });
    expect(await tx.verification.count({ where: { identifier } })).toBe(2);
  });
});

it("retains audit actor identity when deletion is attempted", async () => {
  await expect(withRollback(async (tx) => {
    const user = await createUser(tx);
    const event = await tx.auditEvent.create({
      data: {
        actorId: user.id, action: "CORRECT", entityType: "User", entityId: user.id,
        oldValues: { name: "Before" }, newValues: { name: "After" }, reason: "Clerical correction",
      },
    });
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.oldValues).toEqual({ name: "Before" });
    await tx.user.delete({ where: { id: user.id } });
  })).rejects.toMatchObject({ code: "P2003" });
});

it("cascades disposable authentication records for a user with no audit history", async () => {
  await withRollback(async (tx) => {
    const user = await createUser(tx);
    await tx.session.create({ data: { userId: user.id, token: randomUUID(), expiresAt: new Date() } });
    await tx.account.create({ data: { userId: user.id, providerId: "credential", accountId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
    expect(await tx.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await tx.account.count({ where: { userId: user.id } })).toBe(0);
  });
});
