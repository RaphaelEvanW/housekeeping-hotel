import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import * as unitPhotos from "../../src/server/unit-photo";
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
import { getStockLocations } from "../../src/server/stock-locations";

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
let extraLocationIds: string[] = [];

function postLegacyStock(body: unknown) {
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

async function stockPhoto(color = "#131B2E") {
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: color },
  }).png().toBuffer();
  return new File([new Uint8Array(bytes)], "unit.png", { type: "image/png" });
}

async function postStock(body: unknown, suppliedPhotos?: File[][]) {
  const quantity = body && typeof body === "object" && "quantity" in body
    ? body.quantity : undefined;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    return postLegacyStock(body);
  }
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  const defaultPhoto = suppliedPhotos ? undefined : await stockPhoto();
  for (let index = 0; index < quantity; index++) {
    const files = suppliedPhotos?.[index] ?? (defaultPhoto ? [defaultPhoto] : []);
    for (const file of files) form.append(`photo-${index}`, file);
  }
  return POST(new Request("http://localhost/api/stock-batches", {
    method: "POST", headers: { Origin: "http://localhost:3000" }, body: form,
  }));
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
  extraLocationIds = [];
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

  vi.restoreAllMocks();
  if (!userId) return;

  const photos = await db.itemUnitPhoto.findMany({
    where: { unit: { createdById: userId } }, select: { photoKey: true },
  });
  await db.$transaction([
    db.itemUnitPhoto.deleteMany({ where: { unit: { createdById: userId } } }),
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

  await Promise.all(photos.map(photo => unitPhotos.removeUnitPhoto(photo.photoKey)));
  userId = undefined;
  await db.location.deleteMany({ where: { id: { in: extraLocationIds } } });
});

afterAll(() => db.$disconnect());

async function extraLocation(isActive = true) {
  const location = await db.location.create({ data: { code: `STOCK-${randomUUID()}`, name: "Test selected storage", isActive } });
  extraLocationIds.push(location.id);
  return location;
}

it("stores one selected active location on every unit and audit, including safe replay after location deactivation", async () => {
  const location = await extraLocation();
  expect(await getStockLocations()).toContainEqual({ id: location.id, name: location.name });
  const input = { ...stockInput(), initialLocationId: location.id };
  expect((await postStock(input)).status).toBe(201);
  const units = await db.itemUnit.findMany({ where: { stockBatchId: input.requestId } });
  expect(units).toHaveLength(2);
  expect(units.every(unit => unit.locationId === location.id && unit.custody === "HOUSEKEEPING")).toBe(true);
  const audits = await db.auditEvent.findMany({ where: { actorId: actor.id, action: "STOCK_UNIT_CREATED" } });
  expect(audits).toHaveLength(2);
  for (const audit of audits) expect(audit.newValues).toMatchObject({ locationId: location.id });
  await db.location.update({ where: { id: location.id }, data: { isActive: false } });
  expect(await getStockLocations()).not.toContainEqual({ id: location.id, name: location.name });
  const replay = await postStock(input);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ replayed: true });
  await expectCounts(2, 1);
});

it.each(["missing", "inactive"])("rejects an unavailable selected location atomically: %s", async kind => {
  const initialLocationId = kind === "missing" ? randomUUID() : (await extraLocation(false)).id;
  const response = await postStock({ ...stockInput(), initialLocationId });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "LOCATION_UNAVAILABLE" });
  await expectCounts(0, 0);
});

it("rejects malformed location IDs and conflicts when an existing batch ID changes location", async () => {
  expect((await postStock({ ...stockInput(), initialLocationId: "invalid" })).status).toBe(400);
  const one = await extraLocation();const two = await extraLocation();
  const input = { ...stockInput(), initialLocationId: one.id };
  expect((await postStock(input)).status).toBe(201);
  const conflict = await postStock({ ...input, initialLocationId: two.id });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: "REQUEST_CONFLICT" });
  await expectCounts(2, 1);
});

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
  expect(await db.itemUnitPhoto.count({ where: { unit: { createdById: actor.id } } })).toBe(2);
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

it.each([
  {
    label: "missing Origin",
    header: "Origin",
    value: null,
    status: 403,
    error: "FORBIDDEN_ORIGIN",
  },
  {
    label: "untrusted Origin",
    header: "Origin",
    value: "https://untrusted.example",
    status: 403,
    error: "FORBIDDEN_ORIGIN",
  },
  {
    label: "missing Content-Type",
    header: "Content-Type",
    value: null,
    status: 415,
    error: "UNSUPPORTED_MEDIA_TYPE",
  },
  {
    label: "text/plain Content-Type",
    header: "Content-Type",
    value: "text/plain",
    status: 415,
    error: "UNSUPPORTED_MEDIA_TYPE",
  },
])("rejects $label without adding stock", async (testCase) => {
  const request = new Request(
    "http://localhost:3000/api/stock-batches",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stockInput()),
    },
  );

  if (testCase.value === null) {
    request.headers.delete(testCase.header);
  } else {
    request.headers.set(testCase.header, testCase.value);
  }

  const response = await POST(request);

  expect(response.status).toBe(testCase.status);
  expect(response.headers.get("Cache-Control")).toBe("no-store");

  await expect(response.json()).resolves.toMatchObject({
    error: testCase.error,
  });

  await expectCounts(0, 0);
});

it("rejects oversized JSON without adding stock", async () => {
  const response = await postLegacyStock({
    ...stockInput(),
    extra: "A".repeat(256 * 1024),
  });

  expect(response.status).toBe(413);

  await expect(response.json()).resolves.toMatchObject({
    error: "PAYLOAD_TOO_LARGE",
  });

  await expectCounts(0, 0);
});


it("stores repeated per-unit names, includes them in creation audit and retries safely", async () => {
  const input = { ...stockInput(), units: [{ name: "  Hair   dryer 01 " }, { name: "Hair dryer 01" }] };
  expect((await postStock(input)).status).toBe(201);
  expect((await postStock(input)).status).toBe(200);
  const units = await db.itemUnit.findMany({ where: { stockBatchId: input.requestId } });
  expect(units).toHaveLength(2);
  for (const unit of units) {
    expect(unit.name).toBe("Hair dryer 01");
    expect(await db.auditEvent.findFirstOrThrow({ where: { entityId: unit.id, action: "STOCK_UNIT_CREATED" } })).toMatchObject({ newValues: { name: "Hair dryer 01" } });
  }
  expect((await postStock({ ...input, units: [{ name: "Changed" }, { name: "Hair dryer 01" }] })).status).toBe(409);
  await expectCounts(2, 1);
});

it("keeps the pre-name request hash and treats null/blank/omitted names as the same retry", async () => {
  const input = stockInput();
  const legacyUnits = Array.from({ length: input.quantity }, () => ({ serialNumber: null, notes: null, condition: "GOOD" }));
  const legacyHash = createHash("sha256").update(JSON.stringify({ itemId, quantity: input.quantity, units: legacyUnits })).digest("hex");
  await db.$transaction(async tx => {
    await tx.stockBatch.create({ data: {
      id: input.requestId, itemId, quantity: input.quantity,
      requestHash: legacyHash, createdById: actor.id,
    } });
    const oldUnits = await tx.itemUnit.createManyAndReturn({ data:
      Array.from({ length: input.quantity }, () => ({
        itemId, stockBatchId: input.requestId, locationId: storageId,
        createdById: actor.id, updatedById: actor.id,
      })),
    });
    await tx.auditEvent.createMany({ data: oldUnits.map(unit => ({
      actorId: actor.id, action: "STOCK_UNIT_CREATED",
      entityType: "ITEM_UNIT", entityId: unit.id,
    })) });
  });
  expect((await db.stockBatch.findUniqueOrThrow({ where: { id: input.requestId } })).requestHash).toBe(legacyHash);
  expect((await postLegacyStock({ ...input, units: [{ name: null }, { name: "  " }] })).status).toBe(200);
  expect((await postLegacyStock({ ...input, units: [{ name: "New label" }, {}] })).status).toBe(409);
  expect(await db.itemUnit.findMany({ where: { stockBatchId: input.requestId } })).toEqual(expect.arrayContaining([expect.objectContaining({ name: null })]));
  await expectCounts(2, 1);
});

it.each([42, "a".repeat(101)])("rejects invalid batch names atomically %j", async name => {
  expect((await postStock({ ...stockInput(), units: [{ name: "Valid" }, { name }] })).status).toBe(400);
  await expectCounts(0, 0);
});

it("requires photos for new JSON stock without changing existing data", async () => {
  const response = await postLegacyStock(stockInput());
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "PHOTOS_REQUIRED" });
  await expectCounts(0, 0);
});

it("requires photos for every unit and validates actual image bytes", async () => {
  const missing = await postStock(stockInput(), [[await stockPhoto()], []]);
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({ error: "PHOTOS_REQUIRED" });
  const invalid = new File(["not a photo"], "fake.png", { type: "image/png" });
  const response = await postStock(stockInput(), [[invalid], [await stockPhoto()]]);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "INVALID_PHOTO" });
  await expectCounts(0, 0);
});

it("rejects a per-file size violation even when the multipart body fits", async () => {
  const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
  const response = await postStock(stockInput(), [[oversized], [await stockPhoto()]]);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "INVALID_PHOTO" });
  await expectCounts(0, 0);
});

it("retains multiple initial photos under the same unit creation event", async () => {
  const input = { ...stockInput(), quantity: 1 };
  const files = [[await stockPhoto("#ff0000"), await stockPhoto("#0000ff")]];
  expect((await postStock(input, files)).status).toBe(201);
  expect((await postStock(input, files)).status).toBe(200);
  const photos = await db.itemUnitPhoto.findMany({
    where: { unit: { stockBatchId: input.requestId } },
  });
  expect(photos).toHaveLength(2);
  expect(new Set(photos.map(photo => photo.unitId)).size).toBe(1);
  expect(new Set(photos.map(photo => photo.auditEventId)).size).toBe(1);
  await expectCounts(1, 1);
});

it("binds different photos to the right unit/event and replays without duplicate evidence", async () => {
  const input = { ...stockInput(), units: [{ name: "Unit A" }, { name: "Unit B" }] };
  const files = [[await stockPhoto("#ff0000")], [await stockPhoto("#0000ff")]];
  expect((await postStock(input, files)).status).toBe(201);
  expect((await postStock(input, files)).status).toBe(200);

  const units = await db.itemUnit.findMany({ where: { stockBatchId: input.requestId }, include: {
    photos: { include: { auditEvent: true } },
  } });
  expect(units).toHaveLength(2);
  for (const unit of units) {
    const index = unit.name === "Unit A" ? 0 : 1;
    expect(unit.photos).toHaveLength(1);
    expect(unit.photos[0].auditEvent).toMatchObject({
      entityType: "ITEM_UNIT", entityId: unit.id, action: "STOCK_UNIT_CREATED", actorId: actor.id,
    });
    expect(await unitPhotos.readUnitPhoto(unit.photos[0].photoKey))
      .toEqual(await unitPhotos.prepareUnitPhoto(files[index][0]));
  }
  const changed = [[await stockPhoto("#00ff00")], files[1]];
  expect((await postStock(input, changed)).status).toBe(409);
  await expectCounts(2, 1);
});

it("rolls back units/batch/audits if photo metadata fails and cleans uncommitted files", async () => {
  const originalStore = unitPhotos.storeUnitPhoto;
  let sharedKey: string | undefined;
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(async bytes => {
    sharedKey ??= await originalStore(bytes);
    return sharedKey;
  });
  // The duplicate key forces a real metadata unique-constraint failure inside SQL transaction.
  await expect(postStock(stockInput())).rejects.toMatchObject({ code: "P2002" });
  await expectCounts(0, 0);
  expect(await db.itemUnitPhoto.count({ where: { unit: { createdById: actor.id } } })).toBe(0);
  if (!sharedKey) throw new Error("Expected staged fixture file");
  await expect(unitPhotos.readUnitPhoto(sharedKey)).rejects.toMatchObject({ code: "ENOENT" });
});

it("removes already staged photos when a later image fails before the transaction", async () => {
  const originalStore = unitPhotos.storeUnitPhoto;
  const keys: string[] = [];
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(async bytes => {
    const key = await originalStore(bytes);
    keys.push(key);
    return key;
  });
  try {
    const invalid = new File(["invalid image"], "invalid.png", { type: "image/png" });
    const response = await postStock(stockInput(), [[await stockPhoto()], [invalid]]);
    expect(response.status).toBe(400);
    expect(keys).toHaveLength(1);
    await expectCounts(0, 0);
    await expect(unitPhotos.readUnitPhoto(keys[0])).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await Promise.all(keys.map(key => unitPhotos.removeUnitPhoto(key)));
  }
});

it("retains staged files when the transaction outcome is unknown", async () => {
  const originalStore = unitPhotos.storeUnitPhoto;
  const keys: string[] = [];
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(async bytes => {
    const key = await originalStore(bytes);
    keys.push(key);
    return key;
  });
  const failure = new Error("Connection lost; transaction outcome unknown");
  vi.spyOn(db, "$transaction").mockRejectedValueOnce(failure);
  try {
    await expect(postStock(stockInput())).rejects.toBe(failure);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect((await unitPhotos.readUnitPhoto(key)).byteLength).toBeGreaterThan(0);
    }
  } finally {
    // This fixture's transaction never reached the DB, so its files are safe to remove.
    await Promise.all(keys.map(key => unitPhotos.removeUnitPhoto(key)));
  }
});

it("excludes the guest logical location and rejects it as a stock destination", async () => {
  const location = await db.location.findUniqueOrThrow({
    where: { code: "WITH_GUEST" },
  });

  expect(location.isActive).toBe(true);

  expect(await getStockLocations()).not.toContainEqual({
    id: location.id,
    name: location.name,
  });

  const response = await postStock({
    ...stockInput(),
    initialLocationId: location.id,
  });

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: "LOCATION_UNAVAILABLE",
  });

  await expectCounts(0, 0);
});