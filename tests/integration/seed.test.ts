import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { db } from "../../src/server/db";
import { seedReferenceData } from "../../prisma/seed-reference";
import { withRollback } from "../helpers/transaction";

const referenceLocationWhere = {
  code: { in: ["HK_MAIN_STORAGE", "WITH_GUEST"] },
};

afterAll(() => db.$disconnect());

it("seeds four roles and the default storage once, with stable IDs on repeated runs", async () => {
  await withRollback(async (tx) => {
    await tx.$executeRaw`
      SET TRANSACTION ISOLATION LEVEL REPEATABLE READ
    `;
    const before = {
      users: await tx.user.count(),
      accounts: await tx.account.count(),
      userRoles: await tx.userRole.count(),
    };

    await seedReferenceData(tx);
    const roles = await tx.role.findMany({ orderBy: { code: "asc" } });
    const location = await tx.location.findUnique({
      where: { code: "HK_MAIN_STORAGE" },
    });
    const guestLocation = await tx.location.findUnique({
      where: { code: "WITH_GUEST" },
    });

    expect(guestLocation).toMatchObject({
      code: "WITH_GUEST",
      name: "Bersama tamu",
      isActive: true,
    });
    expect(roles.map((role) => role.code)).toEqual([
      "HK_STAFF",
      "HK_SUPERVISOR",
      "MANAGEMENT",
      "SYSTEM_ADMIN",
    ]);
    expect(location).toMatchObject({ name: "HK Main Storage", isActive: true });
    await seedReferenceData(tx);
    expect(await tx.role.findMany({ orderBy: { code: "asc" } })).toEqual(roles);
    expect(await tx.location.findMany({
      where: referenceLocationWhere,
      orderBy: { code: "asc" },
    })).toEqual([
      location,
      guestLocation,
    ]);
    expect(await tx.user.count()).toBe(before.users);
    expect(await tx.account.count()).toBe(before.accounts);
    expect(await tx.userRole.count()).toBe(before.userRoles);
  });
});

it("preserves edited reference data, user status, and role assignments", async () => {
  await withRollback(async (tx) => {
    await seedReferenceData(tx);
    const role = await tx.role.update({
      where: { code: "SYSTEM_ADMIN" },
      data: { name: "Technical administration" },
    });
    const location = await tx.location.update({
      where: { code: "HK_MAIN_STORAGE" },
      data: { name: "Main storage", isActive: false },
    });
    const user = await tx.user.create({
      data: {
        name: "Test operator",
        email: `${randomUUID()}@example.test`,
        isActive: false,
      },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const guestLocation = await tx.location.update({
      where: { code: "WITH_GUEST" },
      data: {
        name: "Guest custody",
        isActive: false,
      },
    });
    await seedReferenceData(tx);
    expect(await tx.role.findUnique({ where: { id: role.id } })).toEqual(role);
    expect(
      await tx.location.findUnique({ where: { id: location.id } }),
    ).toEqual(location);
    expect(
      await tx.location.findUnique({ where: { id: guestLocation.id } }),
    ).toEqual(guestLocation);
    expect(await tx.user.findUnique({ where: { id: user.id } })).toEqual(user);
    expect(
      await tx.userRole.findMany({ where: { userId: user.id } }),
    ).toHaveLength(1);
  });
});

it("rolls back all reference inserts when the enclosing transaction fails", async () => {
  const rolesBefore = await db.role.count();
  const locationsBefore = await db.location.count({ where: referenceLocationWhere });
  await expect(
    db.$transaction(async (tx) => {
      await seedReferenceData(tx);
      expect(await tx.role.count()).toBe(4);
      expect(
        await tx.location.findUnique({ where: { code: "HK_MAIN_STORAGE" } }),
      ).not.toBeNull();
      throw new Error("abort reference seed");
    }),
  ).rejects.toThrow("abort reference seed");
  expect(await db.role.count()).toBe(rolesBefore);
  expect(await db.location.count({ where: referenceLocationWhere })).toBe(locationsBefore);
});
