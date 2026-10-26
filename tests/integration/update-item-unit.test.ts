import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { db } from "../../src/server/db";
import { PATCH } from "../../src/app/api/item-units/[unitId]/route";
import { getActiveUser } from "../../src/server/get-active-user";
import { GET as getHistoryGET } from "../../src/app/api/item-units/[unitId]/history/route";

import {
  ItemUnitNotFoundError,
  getItemUnits,
  updateItemUnitDetails,
} from "../../src/server/item-units";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const mockGetActiveUser = vi.mocked(getActiveUser);

let userId: string | undefined;
let unitId: string;

function patchUnit(
  rawBody: string,
  targetId = unitId,
  headerOverrides: Record<string, string | null> = {},
) {
  const request = new Request(
    `http://localhost:3000/api/item-units/${targetId}`,
    {
      method: "PATCH",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: rawBody,
    },
  );

  for (const [name, value] of Object.entries(headerOverrides)) {
    if (value === null) {
      request.headers.delete(name);
    } else {
      request.headers.set(name, value);
    }
  }

  return PATCH(request, {
    params: Promise.resolve({ unitId: targetId }),
  });
}

async function expectNoApiMutation() {
  const stored = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  expect(stored).toMatchObject({
    serialNumber: "OLD-SERIAL",
    notes: "Catatan lama.",
    condition: "DAMAGED",
    readiness: "PENDING_INSPECTION",
  });

  expect(
    await db.auditEvent.count({
      where: {
        entityType: "ITEM_UNIT",
        entityId: unitId,
      },
    }),
  ).toBe(0);
}

function getUnitHistory(
  query: Record<string, string> = {},
  targetId = unitId,
) {
  const searchParams = new URLSearchParams(query);

  return getHistoryGET(
    new Request(
      `http://localhost:3000/api/item-units/${targetId}/history?${searchParams}`,
    ),
    {
      params: Promise.resolve({ unitId: targetId }),
    },
  );
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  mockGetActiveUser.mockReset();

  const user = await db.user.create({
    data: {
      name: "Unit correction test",
      email: `${randomUUID()}@example.test`,
    },
  });

  userId = user.id;

  mockGetActiveUser.mockResolvedValue({
    id: user.id,
    name: user.name,
    isActive: true,
    roles: ["HK_STAFF"],
  });

  const name = `Unit correction ${randomUUID()}`;

  const item = await db.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: user.id,
      updatedById: user.id,
    },
  });

  const unit = await db.itemUnit.create({
    data: {
      itemId: item.id,
      serialNumber: "OLD-SERIAL",
      notes: "Catatan lama.",
      condition: "DAMAGED",
      readiness: "PENDING_INSPECTION",
      createdById: user.id,
      updatedById: user.id,
    },
  });

  unitId = unit.id;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockGetActiveUser.mockReset();

  if (!userId) return;

  await db.$transaction([
    db.auditEvent.deleteMany({
      where: { actorId: userId },
    }),
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

it("stores corrected details with an audit and preserves operational state", async () => {
  if (!userId) throw new Error("Test user was not created.");

  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  await updateItemUnitDetails(
    unitId,
    {
      serialNumber: "  NEW-SERIAL  ",
      notes: "  Label diperbaiki.  ",
    },
    userId,
  );

  const stored = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  expect(stored).toEqual({
    ...before,
    serialNumber: "NEW-SERIAL",
    notes: "Label diperbaiki.",
    updatedById: userId,
    updatedAt: expect.any(Date),
  });

  const audits = await db.auditEvent.findMany({
    where: {
      entityType: "ITEM_UNIT",
      entityId: unitId,
    },
  });

  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actorId: userId,
    action: "ITEM_UNIT_DETAILS_UPDATED",
    oldValues: {
      name: null,
      serialNumber: "OLD-SERIAL",
      notes: "Catatan lama.",
    },
    newValues: {
      name: null,
      serialNumber: "NEW-SERIAL",
      notes: "Label diperbaiki.",
    },
  });
});

it.each([
  {
    name: "serial number",
    input: { serialNumber: "NEW-SERIAL" },
    expected: {
      serialNumber: "NEW-SERIAL",
      notes: "Catatan lama.",
    },
  },
  {
    name: "notes",
    input: { notes: "Catatan baru." },
    expected: {
      serialNumber: "OLD-SERIAL",
      notes: "Catatan baru.",
    },
  },
])(
  "updates only $name and preserves the omitted detail",
  async ({ input, expected }) => {
    if (!userId) throw new Error("Test user was not created.");

    await updateItemUnitDetails(unitId, input, userId);

    const stored = await db.itemUnit.findUniqueOrThrow({
      where: { id: unitId },
    });

    expect(stored).toMatchObject(expected);
  },
);

it("clears details using blank strings and explicit null", async () => {
  if (!userId) throw new Error("Test user was not created.");

  await updateItemUnitDetails(
    unitId,
    {
      serialNumber: "   ",
      notes: null,
    },
    userId,
  );

  const stored = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  expect(stored).toMatchObject({
    serialNumber: null,
    notes: null,
  });

  const audit = await db.auditEvent.findFirstOrThrow({
    where: {
      entityType: "ITEM_UNIT",
      entityId: unitId,
      action: "ITEM_UNIT_DETAILS_UPDATED",
    },
  });

  expect(audit.oldValues).toEqual({
    name: null,
    serialNumber: "OLD-SERIAL",
    notes: "Catatan lama.",
  });

  expect(audit.newValues).toEqual({
    name: null,
    serialNumber: null,
    notes: null,
  });
});

it("does not update or audit unchanged normalized details", async () => {
  if (!userId) throw new Error("Test user was not created.");

  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  const result = await updateItemUnitDetails(
    unitId,
    {
      serialNumber: "  OLD-SERIAL  ",
      notes: "  Catatan lama.  ",
    },
    userId,
  );

  const stored = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  expect(result).toEqual(before);
  expect(stored).toEqual(before);

  expect(
    await db.auditEvent.count({
      where: {
        entityType: "ITEM_UNIT",
        entityId: unitId,
      },
    }),
  ).toBe(0);
});

it("rejects a missing unit without creating an audit", async () => {
  if (!userId) throw new Error("Test user was not created.");

  const missingId = randomUUID();

  await expect(
    updateItemUnitDetails(missingId, { notes: "Koreksi." }, userId),
  ).rejects.toBeInstanceOf(ItemUnitNotFoundError);

  expect(
    await db.auditEvent.count({
      where: { actorId: userId },
    }),
  ).toBe(0);
});

it("preserves concurrent name, serial and notes corrections and their audit history", async () => {
  if (!userId) throw new Error("Test user was not created.");

  await Promise.all([
    updateItemUnitDetails(unitId, { name: "Concurrent label" }, userId),
    updateItemUnitDetails(unitId, { serialNumber: "NEW-SERIAL" }, userId),
    updateItemUnitDetails(unitId, { notes: "Catatan baru." }, userId),
  ]);

  const stored = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  expect(stored).toMatchObject({
    name: "Concurrent label",
    serialNumber: "NEW-SERIAL",
    notes: "Catatan baru.",
    condition: "DAMAGED",
    readiness: "PENDING_INSPECTION",
  });

  const audits = await db.auditEvent.findMany({
    where: {
      entityType: "ITEM_UNIT",
      entityId: unitId,
      action: "ITEM_UNIT_DETAILS_UPDATED",
    },
  });

  expect(audits).toHaveLength(3);

  expect(audits).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        oldValues: expect.objectContaining({
          serialNumber: "OLD-SERIAL",
          notes: "Catatan lama.",
        }),
      }),
      expect.objectContaining({
        newValues: expect.objectContaining({
          serialNumber: "NEW-SERIAL",
          notes: "Catatan baru.",
        }),
      }),
    ]),
  );
});

it.each([null, "MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects unit correction through API for role %s",
  async (role) => {
    if (!userId) throw new Error("Test user was not created.");

    mockGetActiveUser.mockResolvedValue(
      role === null
        ? null
        : {
            id: userId,
            name: "Unit correction test",
            isActive: true,
            roles: [role],
          },
    );

    const response = await patchUnit(
      JSON.stringify({ notes: "Koreksi API." }),
    );

    expect(response.status).toBe(role === null ? 401 : 403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    await expectNoApiMutation();
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "lets %s correct a unit through API using the session actor",
  async (role) => {
    if (!userId) throw new Error("Test user was not created.");

    mockGetActiveUser.mockResolvedValue({
      id: userId,
      name: "Unit correction test",
      isActive: true,
      roles: [role],
    });

    const before = await db.itemUnit.findUniqueOrThrow({
      where: { id: unitId },
    });

    const response = await patchUnit(
      JSON.stringify({ notes: "  Koreksi API.  " }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    await expect(response.json()).resolves.toEqual({
      unit: {
        id: unitId,
        itemId: before.itemId,
        unitCode: `HK-${String(before.unitNumber).padStart(6, "0")}`,
        name: null,
        serialNumber: "OLD-SERIAL",
        notes: "Koreksi API.",
        updatedAt: expect.any(String),
      },
    });

    const stored = await db.itemUnit.findUniqueOrThrow({
      where: { id: unitId },
    });

    expect(stored).toMatchObject({
      notes: "Koreksi API.",
      updatedById: userId,
      condition: "DAMAGED",
      readiness: "PENDING_INSPECTION",
    });

    const audit = await db.auditEvent.findFirstOrThrow({
      where: {
        entityType: "ITEM_UNIT",
        entityId: unitId,
        action: "ITEM_UNIT_DETAILS_UPDATED",
      },
    });

    expect(audit.actorId).toBe(userId);
  },
);

const invalidApiCorrectionInputs: unknown[] = [
  { name: 42 },
  { name: "a".repeat(101) },
  null,
  [],
  {},
  { serialNumber: 123 },
  { notes: "Koreksi.", updatedById: "forged-actor" },
  { notes: "Koreksi.", condition: "GOOD" },
];

it.each(
  invalidApiCorrectionInputs.map((input) => ({ input })),
)("rejects invalid unit correction through API: $input", async ({ input }) => {
  const response = await patchUnit(JSON.stringify(input));

  expect(response.status).toBe(400);

  await expect(response.json()).resolves.toMatchObject({
    error: "INVALID_INPUT",
  });

  await expectNoApiMutation();
});

it("returns 400 for an invalid unit ID and 404 for a missing unit", async () => {
  const rawBody = JSON.stringify({ notes: "Koreksi API." });

  const invalid = await patchUnit(rawBody, "invalid");

  expect(invalid.status).toBe(400);

  await expect(invalid.json()).resolves.toMatchObject({
    error: "INVALID_INPUT",
  });

  const missing = await patchUnit(rawBody, randomUUID());

  expect(missing.status).toBe(404);

  await expect(missing.json()).resolves.toMatchObject({
    error: "ITEM_UNIT_NOT_FOUND",
  });

  await expectNoApiMutation();
});

const validPatchBody = JSON.stringify({ notes: "Koreksi API." });

const rejectedPatchCases: {
  name: string;
  rawBody: string;
  headers: Record<string, string | null>;
  status: number;
  error: string;
}[] = [
  {
    name: "missing Origin",
    rawBody: validPatchBody,
    headers: { Origin: null },
    status: 403,
    error: "FORBIDDEN_ORIGIN",
  },
  {
    name: "untrusted Origin",
    rawBody: validPatchBody,
    headers: { Origin: "https://untrusted.example" },
    status: 403,
    error: "FORBIDDEN_ORIGIN",
  },
  {
    name: "missing Content-Type",
    rawBody: validPatchBody,
    headers: { "Content-Type": null },
    status: 415,
    error: "UNSUPPORTED_MEDIA_TYPE",
  },
  {
    name: "unsupported Content-Type",
    rawBody: validPatchBody,
    headers: { "Content-Type": "text/plain" },
    status: 415,
    error: "UNSUPPORTED_MEDIA_TYPE",
  },
  {
    name: "malformed JSON",
    rawBody: '{"notes":',
    headers: {},
    status: 400,
    error: "INVALID_INPUT",
  },
  {
    name: "oversized body",
    rawBody: JSON.stringify({ notes: "a".repeat(256 * 1024) }),
    headers: {},
    status: 413,
    error: "PAYLOAD_TOO_LARGE",
  },
];

it.each(rejectedPatchCases)(
  "rejects $name without changing the unit",
  async ({ rawBody, headers, status, error }) => {
    const response = await patchUnit(rawBody, unitId, headers);

    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    await expect(response.json()).resolves.toMatchObject({
      error,
    });

    await expectNoApiMutation();
  },
);

it.each([null, "SYSTEM_ADMIN"] as const)(
  "rejects unit-history access for role %s",
  async (role) => {
    if (!userId) throw new Error("Test user was not created.");

    mockGetActiveUser.mockResolvedValue(
      role === null
        ? null
        : {
            id: userId,
            name: "Unit correction test",
            isActive: true,
            roles: [role],
          },
    );

    const response = await getUnitHistory();

    expect(response.status).toBe(role === null ? 401 : 403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)(
  "lets %s read recorded corrections with safe actor fields",
  async (role) => {
    if (!userId) throw new Error("Test user was not created.");

    await updateItemUnitDetails(
      unitId,
      { notes: "Catatan baru." },
      userId,
    );

    mockGetActiveUser.mockResolvedValue({
      id: userId,
      name: "Unit correction test",
      isActive: true,
      roles: [role],
    });

    const response = await getUnitHistory();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();

    expect(body.unit.id).toBe(unitId);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      action: "ITEM_UNIT_DETAILS_UPDATED",
      oldValues: {
        name: null,
        serialNumber: "OLD-SERIAL",
        notes: "Catatan lama.",
      },
      newValues: {
        name: null,
        serialNumber: "OLD-SERIAL",
        notes: "Catatan baru.",
      },
    });

    expect(body.events[0].actor).toEqual({
      id: userId,
      name: "Unit correction test",
    });

    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    });

    expect(
      await db.auditEvent.count({
        where: {
          entityType: "ITEM_UNIT",
          entityId: unitId,
        },
      }),
    ).toBe(1);
  },
);

it("returns an empty history for an existing unit without events", async () => {
  const response = await getUnitHistory();

  expect(response.status).toBe(200);

  await expect(response.json()).resolves.toMatchObject({
    unit: { id: unitId },
    events: [],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    },
  });
});

it("paginates history from newest to oldest", async () => {
  if (!userId) throw new Error("Test user was not created.");

  const actorId = userId;
  const ids = [randomUUID(), randomUUID(), randomUUID()];

  await db.auditEvent.createMany({
    data: ids.map((id, index) => ({
      id,
      actorId,
      entityType: "ITEM_UNIT",
      entityId: unitId,
      action:
        index === 0
          ? "STOCK_UNIT_CREATED"
          : "ITEM_UNIT_DETAILS_UPDATED",
      createdAt: new Date(Date.UTC(2026, 0, index + 1)),
    })),
  });

  const cases = [
    {
      page: 1,
      expectedIds: [ids[2], ids[1]],
      hasNextPage: true,
    },
    {
      page: 2,
      expectedIds: [ids[0]],
      hasNextPage: false,
    },
    {
      page: 3,
      expectedIds: [],
      hasNextPage: false,
    },
  ];

  for (const { page, expectedIds, hasNextPage } of cases) {
    const response = await getUnitHistory({
      page: String(page),
      pageSize: "2",
    });

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(
      body.events.map((event: { id: string }) => event.id),
    ).toEqual(expectedIds);

    expect(body.pagination).toEqual({
      page,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      hasNextPage,
    });
  }
});

it("excludes another unit and another entity type", async () => {
  if (!userId) throw new Error("Test user was not created.");

  const unit = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitId },
  });

  const otherUnit = await db.itemUnit.create({
    data: {
      itemId: unit.itemId,
      createdById: userId,
      updatedById: userId,
    },
  });

  await db.auditEvent.createMany({
    data: [
      {
        actorId: userId,
        entityType: "ITEM_UNIT",
        entityId: otherUnit.id,
        action: "STOCK_UNIT_CREATED",
      },
      {
        actorId: userId,
        entityType: "ITEM",
        entityId: unitId,
        action: "ITEM_UPDATED",
      },
    ],
  });

  const response = await getUnitHistory();

  expect(response.status).toBe(200);

  await expect(response.json()).resolves.toMatchObject({
    events: [],
    pagination: { total: 0 },
  });
});

it("keeps history readable for a retired unit under an inactive item", async () => {
  if (!userId) throw new Error("Test user was not created.");

  await updateItemUnitDetails(
    unitId,
    { notes: "Catatan historis." },
    userId,
  );

  const unit = await db.itemUnit.update({
    where: { id: unitId },
    data: { lifecycle: "RETIRED" },
  });

  await db.item.update({
    where: { id: unit.itemId },
    data: { isActive: false },
  });

  const response = await getUnitHistory();

  expect(response.status).toBe(200);

  const body = await response.json();

  expect(body.unit.item.isActive).toBe(false);
  expect(body.events).toHaveLength(1);
  expect(body.events[0]).toMatchObject({
    action: "ITEM_UNIT_DETAILS_UPDATED",
    newValues: {
      notes: "Catatan historis.",
    },
  });
});

it("returns 400 for an invalid history target and 404 for a missing unit", async () => {
  const invalid = await getUnitHistory({}, "invalid");

  expect(invalid.status).toBe(400);

  await expect(invalid.json()).resolves.toMatchObject({
    error: "INVALID_INPUT",
  });

  const missing = await getUnitHistory({}, randomUUID());

  expect(missing.status).toBe(404);

  await expect(missing.json()).resolves.toMatchObject({
    error: "ITEM_UNIT_NOT_FOUND",
  });
});

const invalidHistoryQueries: Record<string, string>[] = [
  { page: "" },
  { page: "0" },
  { page: "1001" },
  { page: "abc" },
  { page: "1.5" },
  { pageSize: "0" },
  { pageSize: "51" },
];

it.each(invalidHistoryQueries)(
  "rejects invalid history pagination: %j",
  async (query) => {
    const response = await getUnitHistory(query);

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_INPUT",
    });
  },
);


it("persists a name-only API correction, reads it and audits it without changing identity/state", async () => {
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: unitId } });
  const response = await patchUnit(JSON.stringify({ name: "  Hair   dryer 01  " }));
  expect(response.status).toBe(200);
  expect((await response.json()).unit).toMatchObject({ id: unitId, name: "Hair dryer 01" });
  const after = await db.itemUnit.findUniqueOrThrow({ where: { id: unitId } });
  expect(after).toEqual({ ...before, name: "Hair dryer 01", updatedAt: expect.any(Date) });
  const list = await getItemUnits(before.itemId);
  expect(list?.units.find(unit => unit.id === unitId)?.name).toBe("Hair dryer 01");
  const history = await (await getUnitHistory()).json();
  expect(history.unit.name).toBe("Hair dryer 01");
  expect(history.events[0]).toMatchObject({ action: "ITEM_UNIT_DETAILS_UPDATED", oldValues: { name: null }, newValues: { name: "Hair dryer 01" } });
});

it.each(["", "   ", null])("clears the optional name with %j and keeps serial/notes", async name => {
  if (!userId) throw new Error("No test actor");
  await updateItemUnitDetails(unitId, { name: "Unit label" }, userId);
  expect((await patchUnit(JSON.stringify({ name }))).status).toBe(200);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: unitId } })).toMatchObject({ name: null, serialNumber: "OLD-SERIAL", notes: "Catatan lama." });
  expect((await (await getUnitHistory()).json()).events[0]).toMatchObject({ oldValues: { name: "Unit label" }, newValues: { name: null } });
});

it("preserves omitted name and does not audit a normalized name no-op", async () => {
  if (!userId) throw new Error("No test actor");
  await updateItemUnitDetails(unitId, { name: "Unit label" }, userId);
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: unitId } });
  await updateItemUnitDetails(unitId, { name: "  Unit   label " }, userId);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: unitId } })).toEqual(before);
  expect(await db.auditEvent.count({ where: { entityId: unitId } })).toBe(1);
  await updateItemUnitDetails(unitId, { notes: "Changed notes" }, userId);
  expect((await db.itemUnit.findUniqueOrThrow({ where: { id: unitId } })).name).toBe("Unit label");
});
