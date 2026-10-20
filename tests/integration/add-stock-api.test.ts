import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import { POST } from "../../src/app/api/stock-batches/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const mockGetActiveUser = vi.mocked(getActiveUser);

type ActiveUser = NonNullable<
  Awaited<ReturnType<typeof getActiveUser>>
>;

let actor: ActiveUser;
let userId: string | undefined;
let itemId: string;
let storageId: string;

function postStock(body: unknown) {
  return POST(
    new Request("http://localhost/api/stock-batches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    }),
  );
}

function stockInput() {
  return {
    requestId: randomUUID(),
    itemId,
    quantity: 2,
  };
}

async function expectCounts(quantity: number, batches: number) {
  expect(
    await db.itemUnit.count({
      where: { createdById: actor.id },
    }),
  ).toBe(quantity);

  expect(
    await db.stockBatch.count({
      where: { createdById: actor.id },
    }),
  ).toBe(batches);

  expect(
    await db.auditEvent.count({
      where: {
        actorId: actor.id,
        action: "STOCK_UNIT_CREATED",
      },
    }),
  ).toBe(quantity);
}

beforeAll(async () => {
  await db.location.createMany({
    data: [
      {
        code: "HK_MAIN_STORAGE",
        name: "HK Main Storage",
      },
    ],
    skipDuplicates: true,
  });

  const storage = await db.location.findUniqueOrThrow({
    where: { code: "HK_MAIN_STORAGE" },
  });

  expect(storage.isActive).toBe(true);
  storageId = storage.id;
});

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  mockGetActiveUser.mockReset();

  const user = await db.user.create({
    data: {
      name: "Add Stock test",
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

  const name = `Stock test ${randomUUID()}`;

  const item = await db.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: user.id,
      updatedById: user.id,
    },
  });

  itemId = item.id;
});

afterEach(async () => {
  vi.unstubAllEnvs();

  if (!userId) return;

  await db.$transaction([
    db.auditEvent.deleteMany({
      where: { actorId: userId },
    }),
    db.itemUnit.deleteMany({
      where: { createdById: userId },
    }),
    db.stockBatch.deleteMany({
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

it("rejects requests without an active account", async () => {
  mockGetActiveUser.mockResolvedValue(null);

  expect((await postStock(stockInput())).status).toBe(401);
  await expectCounts(0, 0);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects stock additions by %s",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    expect((await postStock(stockInput())).status).toBe(403);
    await expectCounts(0, 0);
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "lets %s create physical units with server-controlled fields",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const input = stockInput();

    const response = await postStock({
      ...input,
      createdById: "untrusted-actor",
      locationId: "untrusted-location",
      lifecycle: "RETIRED",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    await expect(response.json()).resolves.toMatchObject({
      batch: {
        id: input.requestId,
        itemId,
        quantity: 2,
      },
      replayed: false,
    });

    const units = await db.itemUnit.findMany({
      where: { stockBatchId: input.requestId },
    });

    expect(units).toHaveLength(2);
    expect(new Set(units.map((unit) => unit.unitNumber)).size).toBe(2);

    for (const unit of units) {
      expect(unit).toMatchObject({
        itemId,
        createdById: actor.id,
        updatedById: actor.id,
        locationId: storageId,
        lifecycle: "ACTIVE",
        custody: "HOUSEKEEPING",
        condition: "GOOD",
        readiness: "CLEAR",
        lossState: "NONE",
      });

      const events = await db.auditEvent.findMany({
        where: {
          actorId: actor.id,
          entityId: unit.id,
        },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: "STOCK_UNIT_CREATED",
        entityType: "ITEM_UNIT",
        newValues: {
          stockBatchId: input.requestId,
          unitNumber: unit.unitNumber,
          condition: "GOOD",
          readiness: "CLEAR",
        },
      });
    }

    await expectCounts(2, 1);
  },
);

it("sends damaged units to inspection and preserves unit details", async () => {
  const input = stockInput();

  const response = await postStock({
    ...input,
    units: [
      { serialNumber: "  SERIAL-A  ", condition: "GOOD" },
      { notes: "  Kabel rusak  ", condition: "DAMAGED" },
    ],
  });

  expect(response.status).toBe(201);

  const units = await db.itemUnit.findMany({
    where: { stockBatchId: input.requestId },
  });

  expect(units).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        serialNumber: "SERIAL-A",
        condition: "GOOD",
        readiness: "CLEAR",
      }),
      expect.objectContaining({
        notes: "Kabel rusak",
        condition: "DAMAGED",
        readiness: "PENDING_INSPECTION",
      }),
    ]),
  );

  await expectCounts(2, 1);
});

it.each([
  { quantity: 0 },
  { quantity: 101 },
  { quantity: 1.5 },
  { quantity: "2" },
  { requestId: "invalid" },
  { units: [{}] },
  { units: [{ condition: "UNKNOWN" }, {}] },
])("rejects invalid input without writes: %j", async (override) => {
  const response = await postStock({
    ...stockInput(),
    ...override,
  });

  expect(response.status).toBe(400);
  await expectCounts(0, 0);
});

it("rejects malformed JSON", async () => {
  const response = await POST(
    new Request("http://localhost/api/stock-batches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: "{",
    }),
  );

  expect(response.status).toBe(400);
  await expectCounts(0, 0);
});

it("returns 404 for a missing item without leaving a batch", async () => {
  const response = await postStock({
    ...stockInput(),
    itemId: randomUUID(),
  });

  expect(response.status).toBe(404);
  await expectCounts(0, 0);
});

it("rolls back the batch when the item is inactive", async () => {
  await db.item.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  const response = await postStock(stockInput());

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    error: "ITEM_INACTIVE",
  });

  await expectCounts(0, 0);
});

it("replays a successful request without adding stock again", async () => {
  const input = stockInput();

  const first = await postStock(input);
  const second = await postStock(input);

  expect(first.status).toBe(201);
  expect(second.status).toBe(200);

  const firstBody = await first.json();

  await expect(second.json()).resolves.toEqual({
    ...firstBody,
    replayed: true,
  });

  await expectCounts(2, 1);
});

it("rejects reuse of a request ID with a different quantity", async () => {
  const input = stockInput();

  expect((await postStock(input)).status).toBe(201);

  const response = await postStock({
    ...input,
    quantity: 3,
  });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({
    error: "REQUEST_CONFLICT",
  });

  await expectCounts(2, 1);
});

it("creates one batch for concurrent copies of the same request", async () => {
  const input = stockInput();

  const responses = await Promise.all([
    postStock(input),
    postStock(input),
    postStock(input),
  ]);

  expect(
    responses.map((response) => response.status).sort(),
  ).toEqual([200, 200, 201]);

  await expectCounts(2, 1);
});

it("creates distinct unit numbers for concurrent different batches", async () => {
  const responses = await Promise.all([
    postStock(stockInput()),
    postStock(stockInput()),
  ]);

  expect(responses.map((response) => response.status)).toEqual([
    201,
    201,
  ]);

  const units = await db.itemUnit.findMany({
    where: { createdById: actor.id },
  });

  expect(new Set(units.map((unit) => unit.unitNumber)).size).toBe(4);
  await expectCounts(4, 2);
});
