import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, afterEach, expect, it, vi } from "vitest";

import { auth } from "../../src/server/auth";
import { db } from "../../src/server/db";
import { requireActiveUser } from "../../src/server/require-active-user";

const request = vi.hoisted(() => ({
  headers: new Headers(),
}));

vi.mock("next/headers", () => ({
  headers: async () => request.headers,
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

afterEach(() => {
  request.headers = new Headers();
});

afterAll(() => db.$disconnect());

it("redirects visitors without a session to login", async () => {
  await expect(requireActiveUser()).rejects.toThrow("REDIRECT:/login");
});

it("reads current roles and rejects a deactivated account with the same session", async () => {
  const userId = randomUUID();
  const email = `${userId}@example.test`;
  const password = randomUUID();
  const passwordHash = await hashPassword(password);

  await db.user.create({
    data: {
      id: userId,
      name: "Session access test",
      email,
      accounts: {
        create: {
          accountId: userId,
          providerId: "credential",
          password: passwordHash,
        },
      },
    },
  });

  try {
    const response = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });

    expect(response.status).toBe(200);

    const cookies = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    request.headers = new Headers({ cookie: cookies });

    await expect(requireActiveUser()).resolves.toMatchObject({
      id: userId,
      isActive: true,
      roles: [],
    });
    
    const staffRole = await db.role.upsert({
      where: { code: "HK_STAFF" },
      update: {},
      create: {
        code: "HK_STAFF",
        name: "Housekeeping Staff",
      },
    });

    const supervisorRole = await db.role.upsert({
          where: { code: "HK_SUPERVISOR" },
          update: {},
          create: {
            code: "HK_SUPERVISOR",
            name: "HK Supervisor",
          },
        });

        await db.userRole.createMany({
      data: [
        { userId, roleId: staffRole.id },
        { userId, roleId: supervisorRole.id },
      ],
    });

    const userWithRoles = await requireActiveUser();

    expect([...userWithRoles.roles].sort()).toEqual([
          "HK_STAFF",
          "HK_SUPERVISOR",
        ]);
        
        await db.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId: supervisorRole.id,
        },
      },
    });

    const userAfterRevocation = await requireActiveUser();

    expect(userAfterRevocation.roles).toEqual(["HK_STAFF"]);

    await db.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    const existingSession = await auth.api.getSession({
      headers: request.headers,
    });

    expect(existingSession?.user.id).toBe(userId);

    await expect(requireActiveUser()).rejects.toThrow("REDIRECT:/login");
  } finally {
    await db.user.delete({
      where: { id: userId },
    });
  }
});