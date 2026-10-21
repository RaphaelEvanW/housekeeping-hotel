import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";

import type { Prisma } from "../../src/generated/prisma/client";
import { db } from "../../src/server/db";
import { withRollback } from "../helpers/transaction";

afterAll(() => db.$disconnect());

async function createFixture(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({
    data: {
      name: "Deactivation test",
      email: `${randomUUID()}@example.test`,
    },
  });

  const name = `Deactivation ${randomUUID()}`;

  const item = await tx.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: user.id,
      updatedById: user.id,
    },
  });

  return {
    user,
    item,
    requestData: {
      itemId: item.id,
      requestedById: user.id,
      reason: "Jenis barang tidak lagi digunakan.",
    },
  };
}

it("creates a pending request without deactivating the item", async () => {
  await withRollback(async (tx) => {
    const { item, requestData } = await createFixture(tx);

    const request = await tx.itemDeactivationRequest.create({
      data: requestData,
    });

    expect(request).toMatchObject({
      status: "PENDING",
      decidedById: null,
      decidedAt: null,
    });

    const stored = await tx.item.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(stored.isActive).toBe(true);
  });
});

it("rejects a second pending request for the same item", async () => {
  await withRollback(async (tx) => {
    const { requestData } = await createFixture(tx);

    await tx.itemDeactivationRequest.create({
      data: requestData,
    });

    await expect(
      tx.itemDeactivationRequest.create({
        data: requestData,
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    });
  });
});

it.each(["APPROVED", "REJECTED", "CANCELLED"] as const)(
  "allows a new pending request after a %s request",
  async (status) => {
    await withRollback(async (tx) => {
      const { user, requestData } = await createFixture(tx);

      await tx.itemDeactivationRequest.create({
        data: {
          ...requestData,
          status,
          decidedById: user.id,
          decidedAt: new Date(),
        },
      });

      const next = await tx.itemDeactivationRequest.create({
        data: requestData,
      });

      expect(next.status).toBe("PENDING");

      expect(
        await tx.itemDeactivationRequest.count({
          where: { itemId: requestData.itemId },
        }),
      ).toBe(2);
    });
  },
);

it.each(["", "   ", "\t\n"])(
  "rejects a blank request reason: %j",
  async (reason) => {
    await withRollback(async (tx) => {
      const { requestData } = await createFixture(tx);

      await expect(
        tx.itemDeactivationRequest.create({
          data: { ...requestData, reason },
        }),
      ).rejects.toThrow();
    });
  },
);

it.each(["APPROVED", "REJECTED", "CANCELLED"] as const)(
  "rejects a %s request without decision details",
  async (status) => {
    await withRollback(async (tx) => {
      const { requestData } = await createFixture(tx);

      await expect(
        tx.itemDeactivationRequest.create({
          data: { ...requestData, status },
        }),
      ).rejects.toThrow();
    });
  },
);

it.each(["actor-only", "time-only"] as const)(
  "rejects incomplete decision details: %s",
  async (details) => {
    await withRollback(async (tx) => {
      const { user, requestData } = await createFixture(tx);

      await expect(
        tx.itemDeactivationRequest.create({
          data: {
            ...requestData,
            status: "APPROVED",
            decidedById: details === "actor-only" ? user.id : null,
            decidedAt: details === "time-only" ? new Date() : null,
          },
        }),
      ).rejects.toThrow();
    });
  },
);

it("rejects decision details on a pending request", async () => {
  await withRollback(async (tx) => {
    const { user, requestData } = await createFixture(tx);

    await expect(
      tx.itemDeactivationRequest.create({
        data: {
          ...requestData,
          decidedById: user.id,
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});

it("rejects cancellation attributed to another user", async () => {
  await withRollback(async (tx) => {
    const { requestData } = await createFixture(tx);

    const other = await tx.user.create({
      data: {
        name: "Other operator",
        email: `${randomUUID()}@example.test`,
      },
    });

    await expect(
      tx.itemDeactivationRequest.create({
        data: {
          ...requestData,
          status: "CANCELLED",
          decidedById: other.id,
          decidedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});