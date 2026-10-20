import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

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

function getUnits(targetItemId = itemId, after?: string) {
  const url = new URL(
    `http://localhost/api/items/${targetItemId}/units`,
  );

  if (after !== undefined) {
    url.searchParams.set("after", after);
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