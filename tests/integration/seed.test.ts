import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { seedReferenceData } from "../../prisma/seed-reference";
import { withRollback } from "../helpers/transaction";

afterAll(() => db.$disconnect());

it("seeds four roles and the default storage once, with stable IDs on repeated runs", async () => {
  await withRollback(async (tx) => {
    await seedReferenceData(tx);
    const roles = await tx.role.findMany({ orderBy: { code: "asc" } });
    const location = await tx.location.findUnique({ where: { code: "HK_MAIN_STORAGE" } });
    expect(roles.map((role) => role.code)).toEqual([
      "HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT", "SYSTEM_ADMIN",
    ]);
    expect(location).toMatchObject({ name: "HK Main Storage", isActive: true });
    await seedReferenceData(tx);
    expect(await tx.role.findMany({ orderBy: { code: "asc" } })).toEqual(roles);
    expect(await tx.location.findMany()).toEqual([location]);
    expect(await tx.user.count()).toBe(0);
    expect(await tx.account.count()).toBe(0);
    expect(await tx.userRole.count()).toBe(0);
  });
});

it("preserves edited reference data, user status, and role assignments", async () => {
  await withRollback(async (tx) => {
    await seedReferenceData(tx);
    const role = await tx.role.update({
      where: { code: "SYSTEM_ADMIN" }, data: { name: "Technical administration" },
    });
    const location = await tx.location.update({
      where: { code: "HK_MAIN_STORAGE" }, data: { name: "Main storage", isActive: false },
    });
    const user = await tx.user.create({
      data: { name: "Test operator", email: `${randomUUID()}@example.test`, isActive: false },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await seedReferenceData(tx);
    expect(await tx.role.findUnique({ where: { id: role.id } })).toEqual(role);
    expect(await tx.location.findUnique({ where: { id: location.id } })).toEqual(location);
    expect(await tx.user.findUnique({ where: { id: user.id } })).toEqual(user);
    expect(await tx.userRole.findMany({ where: { userId: user.id } })).toHaveLength(1);
  });
});

it("rolls back all reference inserts when the enclosing transaction fails", async () => {
  const rolesBefore = await db.role.count();
  const locationsBefore = await db.location.count();
  await expect(db.$transaction(async (tx) => {
    await seedReferenceData(tx);
    expect(await tx.role.count()).toBe(4);
    expect(await tx.location.findUnique({ where: { code: "HK_MAIN_STORAGE" } })).not.toBeNull();
    throw new Error("abort reference seed");
  })).rejects.toThrow("abort reference seed");
  expect(await db.role.count()).toBe(rolesBefore);
  expect(await db.location.count()).toBe(locationsBefore);
});
