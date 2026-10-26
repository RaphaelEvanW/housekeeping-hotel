import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import type { Prisma } from "../../src/generated/prisma/client";
import { GET } from "../../src/app/api/items/[itemId]/units/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const mockGetActiveUser = vi.mocked(getActiveUser);

type ActiveUser = NonNullable<
  Awaited<ReturnType<typeof getActiveUser>>
>;

type UnitsResponse = {
  item: {
    id: string;
    name: string;
    isActive: boolean;
  };
  totalRegistered: number;
  units: {
    id: string;
    unitNumber: number;
    unitCode: string;
  }[];
  nextCursor: number | null;
};

let actor: ActiveUser;
let userId: string | undefined;
let itemId: string;

function getUnits(
  targetItemId = itemId,
  after?: string,
  borrowableOnly?: string,
) {
  const url = new URL(
    `http://localhost/api/items/${targetItemId}/units`,
  );

  if (after !== undefined) {
    url.searchParams.set("after", after);
  }
  if (borrowableOnly !== undefined) {
    url.searchParams.set("borrowableOnly", borrowableOnly);
  }

  return GET(new Request(url), {
    params: Promise.resolve({ itemId: targetItemId }),
  });
}

function createItem() {
  const name = `Inventory test ${randomUUID()}`;

  return db.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
}

function createUnits(quantity: number, targetItemId = itemId) {
  return db.itemUnit.createManyAndReturn({
    data: Array.from({ length: quantity }, () => ({
      itemId: targetItemId,
      createdById: actor.id,
      updatedById: actor.id,
    })),
  });
}

beforeEach(async () => {
  mockGetActiveUser.mockReset();

  const user = await db.user.create({
    data: {
      name: "Inventory read test",
      email: `${randomUUID()}@example.test`,
    },
  });

  userId = user.id;

  actor = {
    id: user.id,
    name: user.name,
    isActive: true,
    roles: ["HK_STAFF"],
  };

  mockGetActiveUser.mockResolvedValue(actor);

  const item = await createItem();
  itemId = item.id;
});

afterEach(async () => {
  if (!userId) return;

  await db.$transaction([
    db.itemUnit.deleteMany({
      where: { createdById: userId },
    }),
    db.item.deleteMany({
      where: { createdById: userId },
    }),
    db.user.delete({
      where: { id: userId },
    }),
  ]);

  userId = undefined;
});

afterAll(() => db.$disconnect());

it("rejects visitors without an active account", async () => {
  mockGetActiveUser.mockResolvedValue(null);

  expect((await getUnits()).status).toBe(401);
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)(
  "allows %s to read inventory",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    expect((await getUnits()).status).toBe(200);
  },
);

it.each([
  {
    label: "SYSTEM_ADMIN only",
    roles: ["SYSTEM_ADMIN"],
  },
  {
    label: "no roles",
    roles: [],
  },
] satisfies { label: string; roles: ActiveUser["roles"] }[])(
  "rejects accounts without inventory permission: $label",
  async ({ roles }) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles,
    });

    expect((await getUnits()).status).toBe(403);
  },
);

it("returns an empty list for an item with no units", async () => {
  const response = await getUnits();

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");

  await expect(response.json()).resolves.toMatchObject({
    item: { id: itemId },
    totalRegistered: 0,
    units: [],
    nextCursor: null,
  });
});

it("returns 404 for a missing item", async () => {
  const response = await getUnits(randomUUID());

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toMatchObject({
    error: "ITEM_NOT_FOUND",
  });
});

it("rejects an invalid item ID", async () => {
  expect((await getUnits("invalid")).status).toBe(400);
});

it.each(["", "0", "-1", "1.5", "abc", "2147483648"])(
  "rejects an invalid cursor: %j",
  async (after) => {
    expect((await getUnits(itemId, after)).status).toBe(400);
  },
);

it("paginates without duplicates and keeps the full total", async () => {
  const created = await createUnits(51);
  const ordered = [...created].sort(
    (left, right) => left.unitNumber - right.unitNumber,
  );

  const firstResponse = await getUnits();
  expect(firstResponse.status).toBe(200);

  const first = (await firstResponse.json()) as UnitsResponse;

  expect(first.totalRegistered).toBe(51);
  expect(first.units).toHaveLength(50);
  expect(first.nextCursor).toBe(ordered[49].unitNumber);

  const secondResponse = await getUnits(
    itemId,
    String(first.nextCursor),
  );
  expect(secondResponse.status).toBe(200);

  const second = (await secondResponse.json()) as UnitsResponse;

  expect(second.totalRegistered).toBe(51);
  expect(second.units).toHaveLength(1);
  expect(second.nextCursor).toBeNull();

  const combined = [...first.units, ...second.units];

  expect(combined.map((unit) => unit.id)).toEqual(
    ordered.map((unit) => unit.id),
  );
  expect(new Set(combined.map((unit) => unit.id)).size).toBe(51);

  for (const unit of combined) {
    expect(unit.unitCode).toMatch(/^HK-\d{6,}$/);
    expect(Number(unit.unitCode.slice(3))).toBe(unit.unitNumber);
  }
});

it("ends pagination at exactly 50 units", async () => {
  await createUnits(50);

  const response = await getUnits();
  const body = (await response.json()) as UnitsResponse;

  expect(response.status).toBe(200);
  expect(body.totalRegistered).toBe(50);
  expect(body.units).toHaveLength(50);
  expect(body.nextCursor).toBeNull();
});

it("returns no units beyond the last cursor but preserves the total", async () => {
  const [unit] = await createUnits(1);

  const response = await getUnits(itemId, String(unit.unitNumber));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    totalRegistered: 1,
    units: [],
    nextCursor: null,
  });
});

it("does not include units belonging to another item", async () => {
  const otherItem = await createItem();
  const [ownUnit] = await createUnits(1);
  await createUnits(3, otherItem.id);

  const response = await getUnits();
  const body = (await response.json()) as UnitsResponse;

  expect(response.status).toBe(200);
  expect(body.totalRegistered).toBe(1);
  expect(body.units.map((unit) => unit.id)).toEqual([ownUnit.id]);
});

it("keeps inactive items and retired or lost units readable", async () => {
  const [retiredUnit, lostUnit] = await createUnits(2);

  await db.$transaction([
    db.item.update({
      where: { id: itemId },
      data: { isActive: false },
    }),
    db.itemUnit.update({
      where: { id: retiredUnit.id },
      data: { lifecycle: "RETIRED" },
    }),
    db.itemUnit.update({
      where: { id: lostUnit.id },
      data: { lossState: "LOST" },
    }),
  ]);

  const response = await getUnits();

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    item: { id: itemId, isActive: false },
    totalRegistered: 2,
    units: expect.arrayContaining([
      expect.objectContaining({
        id: retiredUnit.id,
        lifecycle: "RETIRED",
      }),
      expect.objectContaining({
        id: lostUnit.id,
        lossState: "LOST",
      }),
    ]),
  });
});

it.each(["", "1", "yes", "TRUE"])(
  "rejects an invalid borrowableOnly flag: %j",
  async (flag) => {
    expect((await getUnits(itemId, undefined, flag)).status).toBe(400);
  },
);

it.each([undefined, "false"])(
  "keeps inventory units visible when filtering is disabled: %j",
  async (flag) => {
    const [unit] = await createUnits(1);
    await db.itemUnit.update({
      where: { id: unit.id },
      data: { readiness: "ON_HOLD" },
    });

    const response = await getUnits(itemId, undefined, flag);
    expect(response.status).toBe(200);

    const body = (await response.json()) as UnitsResponse;
    expect(body.units.map((value) => value.id)).toEqual([unit.id]);
    expect(body.totalRegistered).toBe(1);
  },
);

it.each([
  { lifecycle: "RETIRED" },
  { custody: "GUEST" },
  { custody: "ENGINEERING" },
  { custody: "EXTERNAL_VENDOR" },
  { readiness: "ON_HOLD" },
  { readiness: "PENDING_INSPECTION" },
  { readiness: "PENDING_VERIFICATION" },
  { lossState: "MISSING" },
  { lossState: "LOST" },
] satisfies Prisma.ItemUnitUpdateInput[])(
  "excludes blocked units from borrowing selection: %j",
  async (state) => {
    const [blocked, available] = await createUnits(2);

    await db.itemUnit.update({
      where: { id: blocked.id },
      data: state,
    });

    const response = await getUnits(itemId, undefined, "true");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as UnitsResponse;
    expect(body.units.map((unit) => unit.id)).toEqual([available.id]);
    expect(body.totalRegistered).toBe(2);
    expect(body.nextCursor).toBeNull();
  },
);

it("excludes units of inactive types without hiding inventory history", async () => {
  const [unit] = await createUnits(1);

  await db.item.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  const filtered = await getUnits(itemId, undefined, "true");
  expect(filtered.status).toBe(200);
  expect(await filtered.json()).toMatchObject({
    item: { id: itemId, isActive: false },
    totalRegistered: 1,
    units: [],
    nextCursor: null,
  });

  const inventory = await getUnits();
  expect(await inventory.json()).toMatchObject({
    units: [expect.objectContaining({ id: unit.id })],
  });
});

it("paginates eligible units after filtering and preserves the registered total", async () => {
  const created = await createUnits(52);
  const ordered = [...created].sort(
    (left, right) => left.unitNumber - right.unitNumber,
  );

  await db.itemUnit.update({
    where: { id: ordered[0].id },
    data: { readiness: "ON_HOLD" },
  });

  const firstResponse = await getUnits(itemId, undefined, "true");
  expect(firstResponse.status).toBe(200);
  const first = (await firstResponse.json()) as UnitsResponse;

  expect(first.totalRegistered).toBe(52);
  expect(first.units.map((unit) => unit.id)).toEqual(
    ordered.slice(1, 51).map((unit) => unit.id),
  );
  expect(first.nextCursor).toBe(ordered[50].unitNumber);

  const secondResponse = await getUnits(
    itemId,
    String(first.nextCursor),
    "true",
  );
  expect(secondResponse.status).toBe(200);
  const second = (await secondResponse.json()) as UnitsResponse;

  expect(second.totalRegistered).toBe(52);
  expect(second.units.map((unit) => unit.id)).toEqual([ordered[51].id]);
  expect(second.nextCursor).toBeNull();
});

it("excludes outstanding obligations and allows resolved historical lines", async () => {
  const [unit] = await createUnits(1);
  const visit = await db.guestVisit.create({
    data: {
      primaryGuestName: "Selection Guest",
      normalizedPrimaryGuestName: "selection guest",
      roomNumber: "0101",
      bookingNumber: "SELECTION-TEST",
      checkInDate: new Date("2026-10-26T00:00:00Z"),
      plannedCheckoutDate: new Date("2026-10-28T00:00:00Z"),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  let borrowingId: string | undefined;

  try {
    const borrowing = await db.borrowing.create({
      data: {
        guestVisitId: visit.id,
        requestHash: "a".repeat(64),
        primaryGuestNameSnapshot: visit.primaryGuestName,
        roomNumberSnapshot: visit.roomNumber,
        issuedById: actor.id,
        lines: {
          create: {
            unitId: unit.id,
            conditionAtIssue: "GOOD",
          },
        },
      },
      select: {
        id: true,
        lines: { select: { id: true } },
      },
    });
    borrowingId = borrowing.id;

    const blocked = await getUnits(itemId, undefined, "true");
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toMatchObject({
      totalRegistered: 1,
      units: [],
    });

    for (const status of ["RETURNED", "SETTLED"] as const) {
      await db.borrowingLine.update({
        where: { id: borrowing.lines[0].id },
        data: { status, resolvedAt: new Date() },
      });

      const available = await getUnits(itemId, undefined, "true");
      expect(available.status).toBe(200);
      expect(await available.json()).toMatchObject({
        units: [expect.objectContaining({ id: unit.id })],
      });
    }
  } finally {
    if (borrowingId) {
      await db.borrowingLine.deleteMany({ where: { borrowingId } });
      await db.borrowing.delete({ where: { id: borrowingId } });
    }

    await db.guestVisit.delete({ where: { id: visit.id } });
  }
});
