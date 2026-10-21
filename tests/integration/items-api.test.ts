import { randomUUID } from "node:crypto";
import { PATCH } from "../../src/app/api/items/[itemId]/route";

import {
  afterAll,
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import { GET, POST } from "../../src/app/api/items/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const mockGetActiveUser = vi.mocked(getActiveUser);

type ActiveUser = NonNullable<
  Awaited<ReturnType<typeof getActiveUser>>
>;

let userId: string | undefined;
let actor: ActiveUser;

function getItems(query = "") {
  return GET(
    new Request(`http://localhost:3000/api/items?${query}`),
  );
}

function postItem(body: unknown) {
  return POST(
    new Request("http://localhost/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    }),
  );
}

function createEditableItem() {
  const name = `Editable ${randomUUID()}`;

  return db.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
}

function patchItem(
  itemId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return PATCH(
    new Request(`http://localhost:3000/api/items/${itemId}`, {
      method: "PATCH",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    {
      params: Promise.resolve({ itemId }),
    },
  );
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  mockGetActiveUser.mockReset();

  const user = await db.user.create({
    data: {
      name: "Item API test",
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
});

afterEach(async () => {
  vi.unstubAllEnvs();

  if (!userId) return;

  await db.$transaction([
    db.auditEvent.deleteMany({
      where: { actorId: userId },
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

it("returns 401 for requests without an active user", async () => {
  mockGetActiveUser.mockResolvedValue(null);

  expect((await getItems()).status).toBe(401);
  expect((await postItem({ name: "Hair Dryer" })).status).toBe(401);

  expect(
    await db.item.count({ where: { createdById: actor.id } }),
  ).toBe(0);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "enforces read and create permissions for %s",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const expectedReadStatus = role === "MANAGEMENT" ? 200 : 403;

    expect((await getItems()).status).toBe(expectedReadStatus);
    expect((await postItem({ name: "Hair Dryer" })).status).toBe(403);

    expect(
      await db.item.count({ where: { createdById: actor.id } }),
    ).toBe(0);
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "lets %s create an item with server attribution and audit",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const suffix = randomUUID();
    const displayName = `Hair Dryer ${suffix}`;

    const response = await postItem({
      name: `  Hair   Dryer ${suffix}  `,
      createdById: "untrusted-client-value",
      updatedById: "untrusted-client-value",
    });

    expect(response.status).toBe(201);

    const stored = await db.item.findUniqueOrThrow({
      where: { normalizedName: displayName.toLowerCase() },
    });

    expect(stored).toMatchObject({
      name: displayName,
      isActive: true,
      createdById: actor.id,
      updatedById: actor.id,
    });

    const events = await db.auditEvent.findMany({
      where: { actorId: actor.id, entityId: stored.id },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "ITEM_CREATED",
      entityType: "ITEM",
      newValues: {
        name: displayName,
        normalizedName: displayName.toLowerCase(),
      },
    });

    const listResponse = await getItems(
      new URLSearchParams({ q: suffix }).toString(),
    );

    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("Cache-Control")).toBe("no-store");

    await expect(listResponse.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: stored.id,
          name: displayName,
        }),
      ]),
    });
  },
);

it.each([
  null,
  {},
  { name: "" },
  { name: " \t\n " },
  { name: 123 },
])("rejects invalid item input: %j", async (body) => {
  expect((await postItem(body)).status).toBe(400);

  expect(
    await db.item.count({ where: { createdById: actor.id } }),
  ).toBe(0);

  expect(
    await db.auditEvent.count({ where: { actorId: actor.id } }),
  ).toBe(0);
});

it("rejects malformed JSON", async () => {
  const response = await POST(
    new Request("http://localhost/api/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: "{",
    }),
  );

  expect(response.status).toBe(400);
});

it("creates only one item and audit for concurrent normalized duplicates", async () => {
  const suffix = randomUUID();

  const responses = await Promise.all([
    postItem({ name: `Hair Dryer ${suffix}` }),
    postItem({ name: `hair dryer ${suffix}` }),
    postItem({ name: `  Hair   Dryer ${suffix}  ` }),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    201,
    409,
    409,
  ]);

  expect(
    await db.item.count({ where: { createdById: actor.id } }),
  ).toBe(1);

  expect(
    await db.auditEvent.count({ where: { actorId: actor.id } }),
  ).toBe(1);
});

it.each([101, 200_000])(
  "rejects a name with %i characters without writing records",
  async (length) => {
    const response = await postItem({
      name: "A".repeat(length),
    });

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_INPUT",
      message: "Nama jenis barang maksimal 100 karakter.",
    });

    expect(
      await db.item.count({
        where: { createdById: actor.id },
      }),
    ).toBe(0);

    expect(
      await db.auditEvent.count({
        where: { actorId: actor.id },
      }),
    ).toBe(0);
  },
);

it("accepts a name with exactly 100 characters", async () => {
  const name = randomUUID().padEnd(100, "A");

  const response = await postItem({ name });

  expect(response.status).toBe(201);

  await expect(response.json()).resolves.toMatchObject({
    item: { name },
  });
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
])("rejects $label without creating an item", async (testCase) => {
  const request = new Request("http://localhost:3000/api/items", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Guard test ${randomUUID()}`,
    }),
  });

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

  expect(
    await db.item.count({ where: { createdById: actor.id } }),
  ).toBe(0);

  expect(
    await db.auditEvent.count({ where: { actorId: actor.id } }),
  ).toBe(0);
});

it("rejects oversized JSON without creating an item", async () => {
  const response = await postItem({
    name: `Body limit test ${randomUUID()}`,
    extra: "A".repeat(256 * 1024),
  });

  expect(response.status).toBe(413);

  await expect(response.json()).resolves.toMatchObject({
    error: "PAYLOAD_TOO_LARGE",
  });

  expect(
    await db.item.count({ where: { createdById: actor.id } }),
  ).toBe(0);

  expect(
    await db.auditEvent.count({ where: { actorId: actor.id } }),
  ).toBe(0);
});

it.each([
  "page=0",
  "page=-1",
  "page=1.5",
  "page=abc",
  "page=1001",
  "pageSize=0",
  "pageSize=51",
  "pageSize=",
  `q=${"A".repeat(101)}`,
])("rejects invalid list parameters: %s", async (query) => {
  const response = await getItems(query);

  expect(response.status).toBe(400);

  await expect(response.json()).resolves.toMatchObject({
    error: "INVALID_INPUT",
  });
});

it("searches and paginates matching items without repeating records", async () => {
  const prefix = `Page test ${randomUUID()}`;
  const names = ["A", "B", "C"].map(
    (letter) => `${prefix} ${letter}`,
  );

  for (const name of names) {
    expect((await postItem({ name })).status).toBe(201);
  }

  const query = new URLSearchParams({
    q: prefix.toUpperCase().replace(" ", "   "),
    pageSize: "2",
  });

  const firstResponse = await getItems(query.toString());

  expect(firstResponse.status).toBe(200);

  const first = await firstResponse.json();

  expect(first.items.map((item: { name: string }) => item.name))
    .toEqual(names.slice(0, 2));

  expect(first.pagination).toEqual({
    page: 1,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNextPage: true,
  });

  query.set("page", "2");

  const secondResponse = await getItems(query.toString());

  expect(secondResponse.status).toBe(200);

  const second = await secondResponse.json();

  expect(second.items.map((item: { name: string }) => item.name))
    .toEqual([names[2]]);

  expect(second.pagination).toEqual({
    page: 2,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNextPage: false,
  });

  query.set("page", "3");

  const emptyResponse = await getItems(query.toString());

  expect(emptyResponse.status).toBe(200);

  await expect(emptyResponse.json()).resolves.toMatchObject({
    items: [],
    pagination: {
      page: 3,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
    },
  });
});

it.each([null, "MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects item updates for role %s",
  async (role) => {
    const item = await createEditableItem();

    mockGetActiveUser.mockResolvedValue(
      role === null ? null : { ...actor, roles: [role] },
    );

    const response = await patchItem(item.id, {
      name: `Rejected ${randomUUID()}`,
    });

    expect(response.status).toBe(role === null ? 401 : 403);

    const stored = await db.item.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(stored.name).toBe(item.name);

    expect(
      await db.auditEvent.count({
        where: { entityId: item.id },
      }),
    ).toBe(0);
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "lets %s rename an item with an audit",
  async (role) => {
    const item = await createEditableItem();
    const name = `Hair Dryer ${randomUUID()}`;

    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const response = await patchItem(item.id, {
      name: `  ${name.replace("Hair Dryer", "Hair   Dryer")}  `,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    await expect(response.json()).resolves.toMatchObject({
      item: {
        id: item.id,
        name,
      },
    });

    const stored = await db.item.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(stored).toMatchObject({
      name,
      normalizedName: name.toLowerCase(),
      createdById: item.createdById,
      updatedById: actor.id,
      isActive: item.isActive,
    });

    const events = await db.auditEvent.findMany({
      where: { entityId: item.id },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: actor.id,
      action: "ITEM_UPDATED",
      entityType: "ITEM",
      oldValues: {
        name: item.name,
        normalizedName: item.normalizedName,
      },
      newValues: {
        name,
        normalizedName: name.toLowerCase(),
      },
    });
  },
);

it.each([
  null,
  {},
  { name: "" },
  { name: " \t " },
  { name: 123 },
  { name: "A".repeat(101) },
  { name: "Changed", isActive: false },
  { name: "Changed", updatedById: "forged-actor" },
])("rejects invalid update input: %j", async (body) => {
  const item = await createEditableItem();

  expect((await patchItem(item.id, body)).status).toBe(400);

  const stored = await db.item.findUniqueOrThrow({
    where: { id: item.id },
  });

  expect(stored.name).toBe(item.name);

  expect(
    await db.auditEvent.count({
      where: { entityId: item.id },
    }),
  ).toBe(0);
});

it("rejects an invalid item ID", async () => {
  expect(
    (await patchItem("invalid", { name: "Hair Dryer" })).status,
  ).toBe(400);
});

it("returns 404 when the item does not exist", async () => {
  const response = await patchItem(randomUUID(), {
    name: "Hair Dryer",
  });

  expect(response.status).toBe(404);

  await expect(response.json()).resolves.toMatchObject({
    error: "ITEM_NOT_FOUND",
  });
});

it("rejects a duplicate name without changing the item or audit", async () => {
  const first = await createEditableItem();
  const second = await createEditableItem();

  const response = await patchItem(second.id, {
    name: `  ${first.name.toUpperCase()}  `,
  });

  expect(response.status).toBe(409);

  await expect(response.json()).resolves.toMatchObject({
    error: "ITEM_NAME_EXISTS",
  });

  const stored = await db.item.findUniqueOrThrow({
    where: { id: second.id },
  });

  expect(stored.name).toBe(second.name);

  expect(
    await db.auditEvent.count({
      where: { entityId: second.id },
    }),
  ).toBe(0);
});

it("does not write an update or audit when the name is unchanged", async () => {
  const item = await createEditableItem();

  const response = await patchItem(item.id, {
    name: `  ${item.name}  `,
  });

  expect(response.status).toBe(200);

  const stored = await db.item.findUniqueOrThrow({
    where: { id: item.id },
  });

  expect(stored.updatedAt).toEqual(item.updatedAt);

  expect(
    await db.auditEvent.count({
      where: { entityId: item.id },
    }),
  ).toBe(0);
});

it("preserves the audit chain for concurrent edits", async () => {
  const item = await createEditableItem();
  const nameA = `Rename A ${randomUUID()}`;
  const nameB = `Rename B ${randomUUID()}`;

  const responses = await Promise.all([
    patchItem(item.id, { name: nameA }),
    patchItem(item.id, { name: nameB }),
  ]);

  expect(responses.map((response) => response.status))
    .toEqual([200, 200]);

  const stored = await db.item.findUniqueOrThrow({
    where: { id: item.id },
  });

  expect([nameA, nameB]).toContain(stored.name);

  const intermediateName = stored.name === nameA ? nameB : nameA;

  const events = await db.auditEvent.findMany({
    where: { entityId: item.id },
  });

  expect(events).toHaveLength(2);

  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        oldValues: {
          name: item.name,
          normalizedName: item.normalizedName,
        },
        newValues: {
          name: intermediateName,
          normalizedName: intermediateName.toLowerCase(),
        },
      }),
      expect.objectContaining({
        oldValues: {
          name: intermediateName,
          normalizedName: intermediateName.toLowerCase(),
        },
        newValues: {
          name: stored.name,
          normalizedName: stored.normalizedName,
        },
      }),
    ]),
  );
});

it.each([
  ["Origin", "", 403],
  ["Origin", "https://untrusted.example", 403],
  ["Content-Type", "text/plain", 415],
] as const)(
  "rejects update requests with invalid %s: %s",
  async (header, value, status) => {
    const item = await createEditableItem();

    const response = await patchItem(
      item.id,
      { name: "Rejected name" },
      { [header]: value },
    );

    expect(response.status).toBe(status);

    const stored = await db.item.findUniqueOrThrow({
      where: { id: item.id },
    });

    expect(stored.name).toBe(item.name);

    expect(
      await db.auditEvent.count({
        where: { entityId: item.id },
      }),
    ).toBe(0);
  },
);