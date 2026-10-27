import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";
import { db } from "../../src/server/db";
import { withRollback } from "../helpers/transaction";

afterAll(() => db.$disconnect());

async function fixture(tx: Prisma.TransactionClient) {
  const user = await tx.user.create({
    data: {
      name: "Borrowing schema test",
      email: `${randomUUID()}@example.test`,
    },
  });

  const visit = await tx.guestVisit.create({
    data: {
      primaryGuestName: "Schema Guest",
      normalizedPrimaryGuestName: "schema guest",
      roomNumber: "0101",
      bookingNumber: "TEST-001",
      checkInDate: new Date("2026-10-26T00:00:00.000Z"),
      plannedCheckoutDate: new Date("2026-10-28T00:00:00.000Z"),
      createdById: user.id,
      updatedById: user.id,
    },
  });

  const name = `Borrowing schema ${randomUUID()}`;
  const item = await tx.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: user.id,
      updatedById: user.id,
    },
  });

  const unitData = {
    itemId: item.id,
    createdById: user.id,
    updatedById: user.id,
  };
  const unit = await tx.itemUnit.create({ data: unitData });

  const borrowingData = {
    guestVisitId: visit.id,
    requestHash: "a".repeat(64),
    primaryGuestNameSnapshot: visit.primaryGuestName,
    roomNumberSnapshot: visit.roomNumber,
    issuedById: user.id,
  };
  const borrowing = await tx.borrowing.create({ data: borrowingData });
  const line = await tx.borrowingLine.create({
    data: {
      borrowingId: borrowing.id,
      unitId: unit.id,
      conditionAtIssue: "GOOD",
    },
  });

  return { user, visit, unit, unitData, borrowing, borrowingData, line };
}

it("keeps separate occasions under one visit and preserves issue snapshots", async () => {
  await withRollback(async tx => {
    const f = await fixture(tx);
    await tx.guestVisit.update({
      where: { id: f.visit.id },
      data: {
        primaryGuestName: "Updated Guest",
        normalizedPrimaryGuestName: "updated guest",
        roomNumber: "0202",
      },
    });

    const second = await tx.borrowing.create({
      data: {
        ...f.borrowingData,
        primaryGuestNameSnapshot: "Updated Guest",
        roomNumberSnapshot: "0202",
        issuedAt: new Date(f.borrowing.issuedAt.getTime() + 3_600_000),
      },
    });

    expect(second.id).not.toBe(f.borrowing.id);
    expect(await tx.borrowing.count({
      where: { guestVisitId: f.visit.id },
    })).toBe(2);

    expect(await tx.borrowing.findUniqueOrThrow({
      where: { id: f.borrowing.id },
    })).toMatchObject({
      primaryGuestNameSnapshot: "Schema Guest",
      roomNumberSnapshot: "0101",
    });
  });
});

it("rejects another outstanding obligation for the same unit", async () => {
  await withRollback(async tx => {
    const f = await fixture(tx);
    const second = await tx.borrowing.create({ data: f.borrowingData });

    await expect(tx.borrowingLine.create({
      data: {
        borrowingId: second.id,
        unitId: f.unit.id,
        conditionAtIssue: "GOOD",
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });
});

it.each(["RETURNED", "SETTLED"] as const)(
  "releases outstanding uniqueness after the obligation becomes %s",
  async status => {
    await withRollback(async tx => {
      const f = await fixture(tx);
      await tx.borrowingLine.update({
        where: { id: f.line.id },
        data: { status, resolvedAt: new Date() },
      });
      const second = await tx.borrowing.create({ data: f.borrowingData });
      const next = await tx.borrowingLine.create({
        data: {
          borrowingId: second.id,
          unitId: f.unit.id,
          conditionAtIssue: "GOOD",
        },
      });

      expect(next.status).toBe("OUTSTANDING");
    });
  },
);

it("keeps other units outstanding after a partial return", async () => {
  await withRollback(async tx => {
    const f = await fixture(tx);
    const secondUnit = await tx.itemUnit.create({ data: f.unitData });
    await tx.borrowingLine.create({
      data: {
        borrowingId: f.borrowing.id,
        unitId: secondUnit.id,
        conditionAtIssue: "GOOD",
      },
    });

    await tx.borrowingLine.update({
      where: { id: f.line.id },
      data: { status: "RETURNED", resolvedAt: new Date() },
    });

    expect(await tx.borrowingLine.count({
      where: { borrowingId: f.borrowing.id, status: "OUTSTANDING" },
    })).toBe(1);
  });
});

it.each([
  { status: "OUTSTANDING" as const, resolvedAt: new Date() },
  { status: "RETURNED" as const, resolvedAt: null },
  { status: "SETTLED" as const, resolvedAt: null },
])("rejects inconsistent resolution fields %j", async data => {
  await withRollback(async tx => {
    const f = await fixture(tx);
    await expect(tx.borrowingLine.update({
      where: { id: f.line.id },
      data,
    })).rejects.toThrow();
  });
});

it("rejects a repeated unit within an already resolved occasion", async () => {
  await withRollback(async tx => {
    const f = await fixture(tx);
    await tx.borrowingLine.update({
      where: { id: f.line.id },
      data: { status: "RETURNED", resolvedAt: new Date() },
    });
    await expect(tx.borrowingLine.create({
      data: {
        borrowingId: f.borrowing.id,
        unitId: f.unit.id,
        conditionAtIssue: "GOOD",
        status: "RETURNED",
        resolvedAt: new Date(),
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });
});

it("links issue evidence to its own unit and rejects cross-unit photos", async () => {
  await withRollback(async tx => {
    const f = await fixture(tx);
    const event = await tx.auditEvent.create({
      data: {
        actorId: f.user.id,
        action: "BORROWING_ISSUED",
        entityType: "ITEM_UNIT",
        entityId: f.unit.id,
      },
    });

    const photo = await tx.itemUnitPhoto.create({
      data: {
        unitId: f.unit.id,
        auditEventId: event.id,
        borrowingLineId: f.line.id,
        photoKey: `${randomUUID()}.webp`,
      },
    });
    expect(photo.borrowingLineId).toBe(f.line.id);

    const other = await tx.itemUnit.create({ data: f.unitData });
    await expect(tx.itemUnitPhoto.create({
      data: {
        unitId: other.id,
        auditEventId: event.id,
        borrowingLineId: f.line.id,
        photoKey: `${randomUUID()}.webp`,
      },
    })).rejects.toMatchObject({ code: "P2003" });
  });
});

async function returnFixture(tx: Prisma.TransactionClient) {
  const f = await fixture(tx);

  const location = await tx.location.create({
    data: {
      code: randomUUID(),
      name: "Return schema storage",
    },
  });

  const receipt = await tx.returnBatch.create({
    data: {
      guestVisitId: f.visit.id,
      requestHash: "b".repeat(64),
      defaultLocationId: location.id,
      receivedById: f.user.id,
    },
  });

  const returnedLine = await tx.returnLine.create({
    data: {
      returnBatchId: receipt.id,
      borrowingLineId: f.line.id,
      locationId: location.id,
    },
  });

  return { ...f, location, receipt, returnedLine };
}

it("groups returns from separate borrowing occasions under one receipt", async () => {
  await withRollback(async tx => {
    const f = await returnFixture(tx);
    const secondUnit = await tx.itemUnit.create({
      data: f.unitData,
    });
    const secondBorrowing = await tx.borrowing.create({
      data: f.borrowingData,
    });
    const secondLine = await tx.borrowingLine.create({
      data: {
        borrowingId: secondBorrowing.id,
        unitId: secondUnit.id,
        conditionAtIssue: "GOOD",
      },
    });

    await tx.returnLine.create({
      data: {
        returnBatchId: f.receipt.id,
        borrowingLineId: secondLine.id,
        condition: "DAMAGED",
        locationId: f.location.id,
      },
    });

    expect(f.returnedLine.condition).toBe("GOOD");
    expect(await tx.returnLine.count({
      where: { returnBatchId: f.receipt.id },
    })).toBe(2);
  });
});

it("rejects a second return record for the same borrowing line", async () => {
  await withRollback(async tx => {
    const f = await returnFixture(tx);

    await expect(tx.returnLine.create({
      data: {
        returnBatchId: f.receipt.id,
        borrowingLineId: f.line.id,
        locationId: f.location.id,
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });
});

it("rejects return photos linked to a different borrowing line", async () => {
  await withRollback(async tx => {
    const f = await returnFixture(tx);
    const otherUnit = await tx.itemUnit.create({
      data: f.unitData,
    });
    const otherLine = await tx.borrowingLine.create({
      data: {
        borrowingId: f.borrowing.id,
        unitId: otherUnit.id,
        conditionAtIssue: "GOOD",
      },
    });
    const event = await tx.auditEvent.create({
      data: {
        actorId: f.user.id,
        action: "BORROWING_RETURNED",
        entityType: "ITEM_UNIT",
        entityId: otherUnit.id,
      },
    });

    await expect(tx.itemUnitPhoto.create({
      data: {
        unitId: otherUnit.id,
        auditEventId: event.id,
        borrowingLineId: otherLine.id,
        returnLineId: f.returnedLine.id,
        photoKey: `${randomUUID()}.webp`,
      },
    })).rejects.toMatchObject({ code: "P2003" });
  });
});