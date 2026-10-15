import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { afterAll, expect, it } from "vitest";

import { auth } from "../../src/server/auth";
import { db } from "../../src/server/db";

afterAll(() => db.$disconnect());

it.each([
  { isActive: true, expectedStatus: 200, expectedSessions: 1 },
  { isActive: false, expectedStatus: 401, expectedSessions: 0 },
])(
  "login with isActive=$isActive returns $expectedStatus",
  async ({ isActive, expectedStatus, expectedSessions }) => {
    const userId = randomUUID();
    const email = `${userId}@example.test`;
    const password = randomUUID();
    const passwordHash = await hashPassword(password);

    await db.user.create({
      data: {
        id: userId,
        name: "Auth test account",
        email,
        isActive,
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

      expect(response.status).toBe(expectedStatus);

      const sessionCount = await db.session.count({
        where: { userId },
      });

      expect(sessionCount).toBe(expectedSessions);
    } finally {
      await db.user.delete({
        where: { id: userId },
      });
    }
  },
);