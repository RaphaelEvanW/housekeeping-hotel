import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { GET } from "../../src/app/api/item-deactivation-requests/route";
import { POST } from "../../src/app/api/items/[itemId]/deactivation-requests/route";
import { POST as decidePOST } from "../../src/app/api/item-deactivation-requests/[requestId]/decision/route";
import { POST as cancelPOST } from "../../src/app/api/item-deactivation-requests/[requestId]/cancel/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const mockGetActiveUser = vi.mocked(getActiveUser);

type ActiveUser = NonNullable<Awaited<ReturnType<typeof getActiveUser>>>;

let actor: ActiveUser;
let userId: string | undefined;
let itemId: string;

function submit(
  body: unknown,
  targetId = itemId,
  headerOverrides: Record<string, string | null> = {},
) {
  const headers = new Headers({
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  });

  for (const [name, value] of Object.entries(headerOverrides)) {
    if (value === null) {
      headers.delete(name);
    } else {
      headers.set(name, value);
    }
  }

  const request = new Request(
    `http://localhost:3000/api/items/${targetId}/deactivation-requests`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );

  // Request dapat menambahkan Content-Type untuk body string.
  for (const [name, value] of Object.entries(headerOverrides)) {
    if (value === null) request.headers.delete(name);
  }

  return POST(request, {
    params: Promise.resolve({ itemId: targetId }),
  });
}

async function expectCounts(requests: number, audits: number) {
  expect(
    await db.itemDeactivationRequest.count({
      where: { itemId },
    }),
  ).toBe(requests);

  expect(
    await db.auditEvent.count({
      where: { actorId: actor.id },
    }),
  ).toBe(audits);
}

async function createPendingRequest() {
  const response = await submit({
    reason: "Jenis barang tidak lagi digunakan.",
  });

  expect(response.status).toBe(201);

  return db.itemDeactivationRequest.findFirstOrThrow({
    where: { itemId, status: "PENDING" },
  });
}

function decide(requestId: string, body: unknown) {
  return decidePOST(
    new Request(
      `http://localhost:3000/api/item-deactivation-requests/${requestId}/decision`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    ),
    {
      params: Promise.resolve({ requestId }),
    },
  );
}

function cancel(requestId: string, body: unknown = {}) {
  return cancelPOST(
    new Request(
      `http://localhost:3000/api/item-deactivation-requests/${requestId}/cancel`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    ),
    {
      params: Promise.resolve({ requestId }),
    },
  );
}

function getRequests(query: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(query);

  return GET(
    new Request(
      `http://localhost:3000/api/item-deactivation-requests?${searchParams}`,
    ),
  );
}

async function seedRequestHistory() {
  await db.itemDeactivationRequest.createMany({
    data: [
      {
        itemId,
        requestedById: actor.id,
        reason: "Riwayat ditolak.",
        status: "REJECTED",
        decidedById: actor.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        decidedAt: new Date("2026-01-01T01:00:00Z"),
      },
      {
        itemId,
        requestedById: actor.id,
        reason: "Riwayat dibatalkan.",
        status: "CANCELLED",
        decidedById: actor.id,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        decidedAt: new Date("2026-01-02T01:00:00Z"),
      },
      {
        itemId,
        requestedById: actor.id,
        reason: "Masih menunggu keputusan.",
        status: "PENDING",
        createdAt: new Date("2026-01-03T00:00:00Z"),
      },
    ],
  });
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  mockGetActiveUser.mockReset();

  const user = await db.user.create({
    data: {
      name: "Deactivation API test",
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

  const name = `Deactivation API ${randomUUID()}`;

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
    db.itemDeactivationRequest.deleteMany({
      where: { requestedById: userId },
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

it.each([null, "MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects submissions from role %s",
  async (role) => {
    mockGetActiveUser.mockResolvedValue(
      role === null ? null : { ...actor, roles: [role] },
    );

    const response = await submit({ reason: "Tidak digunakan." });

    expect(response.status).toBe(role === null ? 401 : 403);
    await expectCounts(0, 0);
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "lets %s submit without immediately deactivating the item",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const response = await submit({
      reason: "  Tidak lagi digunakan hotel.  ",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const stored = await db.itemDeactivationRequest.findFirstOrThrow({
      where: { itemId },
    });

    expect(stored).toMatchObject({
      requestedById: actor.id,
      reason: "Tidak lagi digunakan hotel.",
      status: "PENDING",
      decidedById: null,
      decidedAt: null,
    });

    await expect(response.json()).resolves.toMatchObject({
      deactivationRequest: {
        id: stored.id,
        status: "PENDING",
        requestedById: actor.id,
      },
    });

    const item = await db.item.findUniqueOrThrow({
      where: { id: itemId },
    });

    expect(item.isActive).toBe(true);

    const event = await db.auditEvent.findFirstOrThrow({
      where: { actorId: actor.id },
    });

    expect(event).toMatchObject({
      action: "ITEM_DEACTIVATION_REQUESTED",
      entityType: "ITEM_DEACTIVATION_REQUEST",
      entityId: stored.id,
      reason: "Tidak lagi digunakan hotel.",
      newValues: {
        itemId,
        status: "PENDING",
        requestedById: actor.id,
      },
    });

    await expectCounts(1, 1);
  },
);

it.each([
  null,
  {},
  { reason: "" },
  { reason: " \t\n " },
  { reason: 123 },
  { reason: "A".repeat(1001) },
  { reason: "Valid", status: "APPROVED" },
  { reason: "Valid", requestedById: "forged-actor" },
])("rejects invalid submission data: %j", async (body) => {
  expect((await submit(body)).status).toBe(400);
  await expectCounts(0, 0);
});

it("rejects an invalid item ID", async () => {
  expect((await submit({ reason: "Tidak digunakan." }, "invalid")).status).toBe(
    400,
  );

  await expectCounts(0, 0);
});

it("returns 404 for a missing item", async () => {
  const response = await submit({ reason: "Tidak digunakan." }, randomUUID());

  expect(response.status).toBe(404);

  await expect(response.json()).resolves.toMatchObject({
    error: "ITEM_NOT_FOUND",
  });

  await expectCounts(0, 0);
});

it("rejects a request for an inactive item", async () => {
  await db.item.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  const response = await submit({ reason: "Tidak digunakan." });

  expect(response.status).toBe(409);

  await expect(response.json()).resolves.toMatchObject({
    error: "ITEM_INACTIVE",
  });

  await expectCounts(0, 0);
});

it("rejects another submission while one is pending", async () => {
  expect((await submit({ reason: "Pengajuan pertama." })).status).toBe(201);

  const second = await submit({ reason: "Pengajuan kedua." });

  expect(second.status).toBe(409);

  await expect(second.json()).resolves.toMatchObject({
    error: "PENDING_REQUEST_EXISTS",
  });

  await expectCounts(1, 1);
});

it("creates one request and audit for concurrent submissions", async () => {
  const responses = await Promise.all([
    submit({ reason: "Pengajuan pertama." }),
    submit({ reason: "Pengajuan kedua." }),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);

  await expectCounts(1, 1);

  const item = await db.item.findUniqueOrThrow({
    where: { id: itemId },
  });

  expect(item.isActive).toBe(true);
});

it.each([
  ["Origin", null, 403],
  ["Origin", "https://untrusted.example", 403],
  ["Content-Type", null, 415],
  ["Content-Type", "text/plain", 415],
] as const)("rejects invalid %s: %s", async (header, value, status) => {
  const response = await submit({ reason: "Tidak digunakan." }, itemId, {
    [header]: value,
  });

  expect(response.status).toBe(status);
  await expectCounts(0, 0);
});

it("rejects oversized JSON without creating records", async () => {
  const response = await submit({
    reason: "A".repeat(256 * 1024),
  });

  expect(response.status).toBe(413);
  await expectCounts(0, 0);
});

it("rejects malformed JSON without creating records", async () => {
  const response = await POST(
    new Request(
      `http://localhost:3000/api/items/${itemId}/deactivation-requests`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: "{",
      },
    ),
    {
      params: Promise.resolve({ itemId }),
    },
  );

  expect(response.status).toBe(400);
  await expectCounts(0, 0);
});

it.each([null, "HK_STAFF", "MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects decisions from role %s",
  async (role) => {
    const pending = await createPendingRequest();

    mockGetActiveUser.mockResolvedValue(
      role === null ? null : { ...actor, roles: [role] },
    );

    const response = await decide(pending.id, {
      decision: "APPROVE",
    });

    expect(response.status).toBe(role === null ? 401 : 403);

    const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect(stored).toMatchObject({
      status: "PENDING",
      decidedById: null,
      decidedAt: null,
    });

    const item = await db.item.findUniqueOrThrow({
      where: { id: itemId },
    });

    expect(item.isActive).toBe(true);
    await expectCounts(1, 1);
  },
);

it.each(["APPROVE", "REJECT"] as const)(
  "lets a Supervisor decide their own request: %s",
  async (decision) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: ["HK_SUPERVISOR"],
    });

    const pending = await createPendingRequest();
    const response = await decide(pending.id, { decision });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const expectedStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";

    const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect(stored).toMatchObject({
      status: expectedStatus,
      requestedById: actor.id,
      decidedById: actor.id,
    });

    expect(stored.decidedAt).toBeInstanceOf(Date);

    await expect(response.json()).resolves.toMatchObject({
      deactivationRequest: {
        id: pending.id,
        status: expectedStatus,
        decidedById: actor.id,
      },
    });

    const item = await db.item.findUniqueOrThrow({
      where: { id: itemId },
    });

    expect(item.isActive).toBe(decision === "REJECT");

    const events = await db.auditEvent.findMany({
      where: { actorId: actor.id },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: `ITEM_DEACTIVATION_${expectedStatus}`,
          entityType: "ITEM_DEACTIVATION_REQUEST",
          entityId: pending.id,
          oldValues: { status: "PENDING" },
          newValues: {
            status: expectedStatus,
            itemId,
            decidedById: actor.id,
          },
        }),
      ]),
    );

    if (decision === "APPROVE") {
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "ITEM_DEACTIVATED",
            entityType: "ITEM",
            entityId: itemId,
            reason: pending.reason,
            oldValues: { isActive: true },
            newValues: {
              isActive: false,
              deactivationRequestId: pending.id,
            },
          }),
        ]),
      );
    }

    await expectCounts(1, decision === "APPROVE" ? 3 : 2);

    // Percobaan keputusan kedua tidak boleh menambah audit.
    expect((await decide(pending.id, { decision })).status).toBe(409);

    await expectCounts(1, decision === "APPROVE" ? 3 : 2);
  },
);

it.each([
  null,
  {},
  { decision: "CANCEL" },
  { decision: "approve" },
  { decision: "APPROVE", decidedById: "forged-actor" },
])("rejects invalid decision data: %j", async (body) => {
  const pending = await createPendingRequest();

  mockGetActiveUser.mockResolvedValue({
    ...actor,
    roles: ["HK_SUPERVISOR"],
  });

  expect((await decide(pending.id, body)).status).toBe(400);

  const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
    where: { id: pending.id },
  });

  expect(stored.status).toBe("PENDING");
  await expectCounts(1, 1);
});

it("returns 404 for a missing deactivation request", async () => {
  mockGetActiveUser.mockResolvedValue({
    ...actor,
    roles: ["HK_SUPERVISOR"],
  });

  const response = await decide(randomUUID(), {
    decision: "APPROVE",
  });

  expect(response.status).toBe(404);

  await expect(response.json()).resolves.toMatchObject({
    error: "REQUEST_NOT_FOUND",
  });

  await expectCounts(0, 0);
});

it("returns 400 for an invalid deactivation request ID", async () => {
  mockGetActiveUser.mockResolvedValue({
    ...actor,
    roles: ["HK_SUPERVISOR"],
  });

  expect((await decide("invalid", { decision: "APPROVE" })).status).toBe(400);

  await expectCounts(0, 0);
});

it("accepts only one of concurrent approve and reject decisions", async () => {
  const pending = await createPendingRequest();

  mockGetActiveUser.mockResolvedValue({
    ...actor,
    roles: ["HK_SUPERVISOR"],
  });

  const responses = await Promise.all([
    decide(pending.id, { decision: "APPROVE" }),
    decide(pending.id, { decision: "REJECT" }),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);

  const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
    where: { id: pending.id },
  });

  expect(["APPROVED", "REJECTED"]).toContain(stored.status);

  const item = await db.item.findUniqueOrThrow({
    where: { id: itemId },
  });

  expect(item.isActive).toBe(stored.status === "REJECTED");

  await expectCounts(1, stored.status === "APPROVED" ? 3 : 2);
});

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "lets %s cancel their own pending request",
  async (role) => {
    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const pending = await createPendingRequest();
    const response = await cancel(pending.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect(stored).toMatchObject({
      status: "CANCELLED",
      requestedById: actor.id,
      decidedById: actor.id,
    });

    expect(stored.decidedAt).toBeInstanceOf(Date);

    await expect(response.json()).resolves.toMatchObject({
      deactivationRequest: {
        id: pending.id,
        status: "CANCELLED",
      },
    });

    const item = await db.item.findUniqueOrThrow({
      where: { id: itemId },
    });

    expect(item.isActive).toBe(true);

    const event = await db.auditEvent.findFirstOrThrow({
      where: {
        entityId: pending.id,
        action: "ITEM_DEACTIVATION_CANCELLED",
      },
    });

    expect(event).toMatchObject({
      actorId: actor.id,
      oldValues: { status: "PENDING" },
      newValues: {
        status: "CANCELLED",
        itemId,
        decidedById: actor.id,
      },
    });

    await expectCounts(1, 2);

    expect((await cancel(pending.id)).status).toBe(409);
    await expectCounts(1, 2);

    // Pembatalan membuka kesempatan membuat pengajuan baru.
    expect(
      (await submit({ reason: "Pengajuan baru setelah dibatalkan." })).status,
    ).toBe(201);

    await expectCounts(2, 3);
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "prevents another %s from cancelling the request",
  async (role) => {
    const pending = await createPendingRequest();

    const other = await db.user.create({
      data: {
        name: "Other cancellation operator",
        email: `${randomUUID()}@example.test`,
      },
    });

    try {
      mockGetActiveUser.mockResolvedValue({
        id: other.id,
        name: other.name,
        isActive: true,
        roles: [role],
      });

      const response = await cancel(pending.id);

      expect(response.status).toBe(403);

      await expect(response.json()).resolves.toMatchObject({
        error: "REQUEST_NOT_OWNER",
      });

      const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
        where: { id: pending.id },
      });

      expect(stored.status).toBe("PENDING");

      expect(
        await db.auditEvent.count({
          where: { actorId: other.id },
        }),
      ).toBe(0);

      await expectCounts(1, 1);
    } finally {
      await db.user.delete({
        where: { id: other.id },
      });
    }
  },
);

it.each([null, "MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects cancellation from role %s",
  async (role) => {
    const pending = await createPendingRequest();

    mockGetActiveUser.mockResolvedValue(
      role === null ? null : { ...actor, roles: [role] },
    );

    expect((await cancel(pending.id)).status).toBe(role === null ? 401 : 403);

    const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect(stored.status).toBe("PENDING");
    await expectCounts(1, 1);
  },
);

it.each(["APPROVE", "REJECT"] as const)(
  "rejects cancellation after decision %s",
  async (decision) => {
    const pending = await createPendingRequest();

    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: ["HK_SUPERVISOR"],
    });

    expect((await decide(pending.id, { decision })).status).toBe(200);

    const before = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect((await cancel(pending.id)).status).toBe(409);

    const after = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect(after).toEqual(before);
    await expectCounts(1, decision === "APPROVE" ? 3 : 2);
  },
);

it.each([null, { status: "CANCELLED" }, { actorId: "forged-actor" }])(
  "rejects invalid cancellation input: %j",
  async (body) => {
    const pending = await createPendingRequest();

    expect((await cancel(pending.id, body)).status).toBe(400);

    const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
      where: { id: pending.id },
    });

    expect(stored.status).toBe("PENDING");
    await expectCounts(1, 1);
  },
);

it("rejects an invalid or nonexistent cancellation target", async () => {
  expect((await cancel("invalid")).status).toBe(400);

  const response = await cancel(randomUUID());

  expect(response.status).toBe(404);

  await expect(response.json()).resolves.toMatchObject({
    error: "REQUEST_NOT_FOUND",
  });

  await expectCounts(0, 0);
});

it("accepts only one of concurrent cancellation and approval", async () => {
  const pending = await createPendingRequest();

  mockGetActiveUser.mockResolvedValue({
    ...actor,
    roles: ["HK_SUPERVISOR"],
  });

  const responses = await Promise.all([
    cancel(pending.id),
    decide(pending.id, { decision: "APPROVE" }),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);

  const stored = await db.itemDeactivationRequest.findUniqueOrThrow({
    where: { id: pending.id },
  });

  expect(["CANCELLED", "APPROVED"]).toContain(stored.status);

  const item = await db.item.findUniqueOrThrow({
    where: { id: itemId },
  });

  expect(item.isActive).toBe(stored.status === "CANCELLED");

  await expectCounts(1, stored.status === "APPROVED" ? 3 : 2);
});

it.each([null, "SYSTEM_ADMIN"] as const)(
  "rejects request-list access for role %s",
  async (role) => {
    mockGetActiveUser.mockResolvedValue(
      role === null ? null : { ...actor, roles: [role] },
    );

    expect((await getRequests({ itemId })).status).toBe(
      role === null ? 401 : 403,
    );
  },
);

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)(
  "lets %s read pending requests with safe user fields",
  async (role) => {
    const pending = await createPendingRequest();

    mockGetActiveUser.mockResolvedValue({
      ...actor,
      roles: [role],
    });

    const response = await getRequests({ itemId });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = await response.json();

    expect(body.deactivationRequests).toHaveLength(1);
    expect(body.deactivationRequests[0]).toMatchObject({
      id: pending.id,
      status: "PENDING",
      reason: pending.reason,
      item: {
        id: itemId,
        isActive: true,
      },
      decidedBy: null,
      decidedAt: null,
    });

    expect(body.deactivationRequests[0].requestedBy).toEqual({
      id: actor.id,
      name: actor.name,
    });

    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    });
  },
);

it.each(["PENDING", "REJECTED", "CANCELLED"] as const)(
  "filters requests by status %s",
  async (status) => {
    await seedRequestHistory();

    const response = await getRequests({ itemId, status });

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.deactivationRequests).toHaveLength(1);
    expect(body.deactivationRequests[0].status).toBe(status);
    expect(body.pagination.total).toBe(1);
  },
);

it("defaults to pending requests when status is omitted", async () => {
  await seedRequestHistory();

  const response = await getRequests({ itemId });

  expect(response.status).toBe(200);

  const body = await response.json();

  expect(body.deactivationRequests).toHaveLength(1);
  expect(body.deactivationRequests[0].status).toBe("PENDING");
  expect(body.pagination.total).toBe(1);
});

it("paginates all statuses from newest to oldest", async () => {
  await seedRequestHistory();

  const query = {
    itemId,
    status: "ALL",
    pageSize: "2",
  };

  const firstResponse = await getRequests(query);

  expect(firstResponse.status).toBe(200);

  const first = await firstResponse.json();

  expect(
    first.deactivationRequests.map(
      (request: { status: string }) => request.status,
    ),
  ).toEqual(["PENDING", "CANCELLED"]);

  expect(first.pagination).toEqual({
    page: 1,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNextPage: true,
  });

  const secondResponse = await getRequests({
    ...query,
    page: "2",
  });

  expect(secondResponse.status).toBe(200);

  const second = await secondResponse.json();

  expect(
    second.deactivationRequests.map(
      (request: { status: string }) => request.status,
    ),
  ).toEqual(["REJECTED"]);

  expect(second.pagination).toEqual({
    page: 2,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNextPage: false,
  });

  const emptyResponse = await getRequests({
    ...query,
    page: "3",
  });

  expect(emptyResponse.status).toBe(200);

  await expect(emptyResponse.json()).resolves.toMatchObject({
    deactivationRequests: [],
    pagination: {
      page: 3,
      total: 3,
      hasNextPage: false,
    },
  });
});

it("does not return another item's requests", async () => {
  await createPendingRequest();

  const response = await getRequests({
    itemId: randomUUID(),
    status: "ALL",
  });

  expect(response.status).toBe(200);

  await expect(response.json()).resolves.toMatchObject({
    deactivationRequests: [],
    pagination: {
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    },
  });
});

it("keeps approved requests readable after item deactivation", async () => {
  const pending = await createPendingRequest();

  mockGetActiveUser.mockResolvedValue({
    ...actor,
    roles: ["HK_SUPERVISOR"],
  });

  expect((await decide(pending.id, { decision: "APPROVE" })).status).toBe(200);

  const response = await getRequests({
    itemId,
    status: "APPROVED",
  });

  expect(response.status).toBe(200);

  await expect(response.json()).resolves.toMatchObject({
    deactivationRequests: [
      {
        id: pending.id,
        status: "APPROVED",
        item: {
          id: itemId,
          isActive: false,
        },
        decidedBy: {
          id: actor.id,
          name: actor.name,
        },
      },
    ],
  });
});

const invalidRequestListQueries: Record<string, string>[] = [
  { page: "0" },
  { page: "1001" },
  { page: "abc" },
  { pageSize: "0" },
  { pageSize: "51" },
  { status: "unknown" },
  { itemId: "invalid" },
];

it.each(invalidRequestListQueries)(
  "rejects invalid request-list parameters: %j",
  async (query) => {
    const response = await getRequests(query);

    expect(response.status).toBe(400);

    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_INPUT",
    });
  },
);
