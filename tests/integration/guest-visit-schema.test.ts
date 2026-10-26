import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";

import type { Prisma } from "../../src/generated/prisma/client";
import { db } from "../../src/server/db";
import { withRollback } from "../helpers/transaction";

afterAll(() => db.$disconnect());

async function createFixture(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({
    data: {
      name: "Guest visit schema test",
      email: `${randomUUID()}@example.test`,
    },
  });

  const visitData = {
    primaryGuestName: "Schema Guest",
    normalizedPrimaryGuestName: "schema guest",
    roomNumber: "0101",
    checkInDate: new Date("2026-01-01T00:00:00.000Z"),
    plannedCheckoutDate: new Date("2026-01-03T00:00:00.000Z"),
    createdById: user.id,
    updatedById: user.id,
  };

  return { user, visitData };
}

it("stores date-only stay details and defaults to staying", async () => {
  await withRollback(async (tx) => {
    const { user, visitData } = await createFixture(tx);

    const visit = await tx.guestVisit.create({
      data: visitData,
    });

    expect(visit).toMatchObject({
      primaryGuestName: "Schema Guest",
      normalizedPrimaryGuestName: "schema guest",
      roomNumber: "0101",
      status: "STAYING",
      checkedOutAt: null,
      isDuplicate: false,
      bookingNumber: null,
      registrationRequestHash: null,
      createdById: user.id,
      updatedById: user.id,
    });

    expect(visit.checkInDate).toEqual(new Date("2026-01-01T00:00:00.000Z"));

    expect(visit.plannedCheckoutDate).toEqual(
      new Date("2026-01-03T00:00:00.000Z"),
    );

    expect(visit.createdAt).toBeInstanceOf(Date);
    expect(visit.updatedAt).toBeInstanceOf(Date);
  });
});

it("allows check-in and planned checkout on the same date", async () => {
  await withRollback(async (tx) => {
    const { visitData } = await createFixture(tx);

    const visit = await tx.guestVisit.create({
      data: {
        ...visitData,
        plannedCheckoutDate: visitData.checkInDate,
      },
    });

    expect(visit.plannedCheckoutDate).toEqual(visit.checkInDate);
    expect(visit.status).toBe("STAYING");
  });
});

it("allows separate visit records with identical guest and stay details", async () => {
  await withRollback(async (tx) => {
    const { user, visitData } = await createFixture(tx);

    const first = await tx.guestVisit.create({
      data: visitData,
    });

    const second = await tx.guestVisit.create({
      data: {
        ...visitData,
        isDuplicate: true,
      },
    });

    expect(second.id).not.toBe(first.id);
    expect(second.isDuplicate).toBe(true);

    expect(
      await tx.guestVisit.count({
        where: { createdById: user.id },
      }),
    ).toBe(2);
  });
});

it("stores checked-out status with an actual checkout timestamp", async () => {
  await withRollback(async (tx) => {
    const { visitData } = await createFixture(tx);
    const checkedOutAt = new Date("2026-01-02T08:30:00.000Z");

    const visit = await tx.guestVisit.create({
      data: {
        ...visitData,
        status: "CHECKED_OUT",
        checkedOutAt,
      },
    });

    expect(visit.status).toBe("CHECKED_OUT");
    expect(visit.checkedOutAt).toEqual(checkedOutAt);
    expect(visit.plannedCheckoutDate).toEqual(
      new Date("2026-01-03T00:00:00.000Z"),
    );
  });
});

const invalidUpdates: {
  name: string;
  data: Prisma.GuestVisitUncheckedUpdateInput;
}[] = [
  { name: "blank booking number", data: { bookingNumber: "   " } },
  {
    name: "invalid registration hash",
    data: { registrationRequestHash: "invalid" },
  },
  {
    name: "registration hash without booking number",
    data: { registrationRequestHash: "a".repeat(64) },
  },
  {
    name: "blank primary guest name",
    data: { primaryGuestName: " \t\n " },
  },
  {
    name: "blank normalized guest name",
    data: { normalizedPrimaryGuestName: "" },
  },
  {
    name: "blank room number",
    data: { roomNumber: "   " },
  },
  {
    name: "planned checkout before check-in",
    data: {
      plannedCheckoutDate: new Date("2025-12-31T00:00:00.000Z"),
    },
  },
  {
    name: "checked-out status without checkout timestamp",
    data: { status: "CHECKED_OUT" },
  },
  {
    name: "staying status with checkout timestamp",
    data: {
      checkedOutAt: new Date("2026-01-02T08:30:00.000Z"),
    },
  },
];

it.each(invalidUpdates)(
  "rejects $name at the database boundary",
  async ({ data }) => {
    await withRollback(async (tx) => {
      const { visitData } = await createFixture(tx);

      const visit = await tx.guestVisit.create({
        data: visitData,
      });

      await expect(
        tx.guestVisit.update({
          where: { id: visit.id },
          data,
        }),
      ).rejects.toThrow();
    });
  },
);

it("prevents deletion of an actor referenced by a guest visit", async () => {
  await withRollback(async (tx) => {
    const { user, visitData } = await createFixture(tx);

    await tx.guestVisit.create({
      data: visitData,
    });

    await expect(
      tx.user.delete({
        where: { id: user.id },
      }),
    ).rejects.toMatchObject({
      code: "P2003",
    });
  });
});
