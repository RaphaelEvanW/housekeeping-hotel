import { randomUUID } from "node:crypto";
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

  expect((await GET()).status).toBe(401);
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

    expect((await GET()).status).toBe(expectedReadStatus);
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

    const listResponse = await GET();

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