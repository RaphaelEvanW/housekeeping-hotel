import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Prisma } from "../../src/generated/prisma/client";
import { POST } from "../../src/app/api/borrowings/route";
import { GET as GET_BORROWINGS } from "../../src/app/api/guest-visits/[visitId]/borrowings/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";
import * as unitPhotos from "../../src/server/unit-photo";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

type ActiveUser = NonNullable<Awaited<ReturnType<typeof getActiveUser>>>;

const mockUser = vi.mocked(getActiveUser);
let actor: ActiveUser;
let visitId: string;
let itemId: string;
let locationId: string;
let unitIds: string[];
let files: File[][];

function input() {
  return {
    requestId: randomUUID(),
    guestVisitId: visitId,
    unitIds: [...unitIds],
  };
}

function post(body: unknown, photos = files, origin = "http://localhost:3000") {
  const form = new FormData();
  form.set("data", JSON.stringify(body));

  photos.forEach((group, index) => {
    group.forEach((file) => form.append(`photo-${index}`, file));
  });

  return POST(
    new Request("http://localhost/api/borrowings", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    }),
  );
}

function getBorrowings(
  query: Record<string, string> = {},
  targetVisitId = visitId,
) {
  const url = new URL(`http://localhost/api/guest-visits/${targetVisitId}/borrowings`);
  url.search = new URLSearchParams(query).toString();

  return GET_BORROWINGS(new Request(url), {
    params: Promise.resolve({ visitId: targetVisitId }),
  });
}

async function expectNoIssue() {
  expect(
    await db.borrowing.count({
      where: { issuedById: actor.id },
    }),
  ).toBe(0);

  expect(
    await db.borrowingLine.count({
      where: { unitId: { in: unitIds } },
    }),
  ).toBe(0);

  expect(
    await db.auditEvent.count({
      where: { actorId: actor.id },
    }),
  ).toBe(0);

  expect(
    await db.itemUnitPhoto.count({
      where: { unitId: { in: unitIds } },
    }),
  ).toBe(0);
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  mockUser.mockReset();

  const user = await db.user.create({
    data: {
      name: "Issue test",
      email: `${randomUUID()}@example.test`,
    },
  });

  actor = {
    id: user.id,
    name: user.name,
    isActive: true,
    roles: ["HK_STAFF"],
  };
  mockUser.mockResolvedValue(actor);

  const visit = await db.guestVisit.create({
    data: {
      primaryGuestName: "Issue Guest",
      normalizedPrimaryGuestName: "issue guest",
      roomNumber: "0101",
      bookingNumber: "ISSUE-TEST",
      checkInDate: new Date("2026-10-26T00:00:00Z"),
      plannedCheckoutDate: new Date("2026-10-28T00:00:00Z"),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  visitId = visit.id;

  const name = `Issue ${randomUUID()}`;
  const item = await db.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  itemId = item.id;

  const location = await db.location.create({
    data: { code: `ISSUE-${randomUUID()}`, name: "Issue storage" },
  });
  locationId = location.id;

  const units = await db.itemUnit.createManyAndReturn({
    data: [0, 1].map(() => ({
      itemId,
      locationId,
      createdById: actor.id,
      updatedById: actor.id,
    })),
    select: { id: true },
  });
  unitIds = units.map((unit) => unit.id);

  files = [];
  for (const color of ["#ff0000", "#0000ff"]) {
    const bytes = await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer();

    files.push([
      new File([new Uint8Array(bytes)], "issue.png", {
        type: "image/png",
      }),
    ]);
  }
});

afterEach(async () => {
  vi.restoreAllMocks();

  const photos = await db.itemUnitPhoto.findMany({
    where: { unit: { createdById: actor.id } },
    select: { photoKey: true },
  });

  await db.$transaction(async (tx) => {
    await tx.itemUnitPhoto.deleteMany({
      where: { unit: { createdById: actor.id } },
    });
    await tx.auditEvent.deleteMany({ where: { actorId: actor.id } });
    await tx.borrowingLine.deleteMany({
      where: { borrowing: { issuedById: actor.id } },
    });
    await tx.borrowing.deleteMany({ where: { issuedById: actor.id } });
    await tx.itemUnit.deleteMany({ where: { createdById: actor.id } });
    await tx.item.deleteMany({ where: { createdById: actor.id } });
    await tx.guestVisit.deleteMany({ where: { createdById: actor.id } });
    await tx.location.delete({ where: { id: locationId } });
    await tx.user.delete({ where: { id: actor.id } });
  });

  await Promise.all(
    photos.map((photo) => unitPhotos.removeUnitPhoto(photo.photoKey)),
  );
  vi.unstubAllEnvs();
});

afterAll(() => db.$disconnect());

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "issues units atomically as %s with linked evidence",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    const response = await post(input());
    expect(response.status).toBe(201);

    const result = await response.json();
    expect(result).toMatchObject({
      replayed: false,
      borrowing: {
        guestVisitId: visitId,
        primaryGuestNameSnapshot: "Issue Guest",
        roomNumberSnapshot: "0101",
      },
    });
    expect(result.borrowing.lines).toHaveLength(2);
    expect(result.borrowing).not.toHaveProperty("requestHash");
    expect(result.borrowing).not.toHaveProperty("issuedById");

    const destination = await db.location.findUniqueOrThrow({
      where: { code: "WITH_GUEST" },
    });
    const units = await db.itemUnit.findMany({
      where: { id: { in: unitIds } },
    });

    for (const unit of units) {
      expect(unit).toMatchObject({
        custody: "GUEST",
        locationId: destination.id,
        condition: "GOOD",
        readiness: "CLEAR",
        lifecycle: "ACTIVE",
        lossState: "NONE",
      });
    }

    const lines = await db.borrowingLine.findMany({
      where: { borrowingId: result.borrowing.id },
      include: {
        photos: { include: { auditEvent: true } },
      },
    });

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.status).toBe("OUTSTANDING");
      expect(line.conditionAtIssue).toBe("GOOD");
      expect(line.photos).toHaveLength(1);

      const photo = line.photos[0];
      expect(photo.unitId).toBe(line.unitId);
      expect(photo.auditEvent).toMatchObject({
        action: "BORROWING_ISSUED",
        entityType: "ITEM_UNIT",
        entityId: line.unitId,
        actorId: actor.id,
      });
      expect(
        (await unitPhotos.readUnitPhoto(photo.photoKey)).length,
      ).toBeGreaterThan(0);
    }
  },
);

it("replays without resetting later guest or unit changes", async () => {
  const value = input();
  const first = await post(value);
  expect(first.status).toBe(201);
  const saved = await first.json();

  await db.guestVisit.update({
    where: { id: visitId },
    data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
  });
  await db.item.update({
    where: { id: itemId },
    data: { isActive: false },
  });
  await db.itemUnit.updateMany({
    where: { id: { in: unitIds } },
    data: { readiness: "ON_HOLD" },
  });

  const retry = await post(value);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ...saved, replayed: true });

  expect(
    await db.borrowing.count({
      where: { guestVisitId: visitId },
    }),
  ).toBe(1);
  expect(
    await db.itemUnitPhoto.count({
      where: { unitId: { in: unitIds } },
    }),
  ).toBe(2);
  expect(
    await db.itemUnit.count({
      where: { id: { in: unitIds }, readiness: "ON_HOLD" },
    }),
  ).toBe(2);

  const conflict = await post({
    ...value,
    unitIds: [...unitIds].reverse(),
  });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({
    error: "REQUEST_CONFLICT",
  });
});

it("records separate borrowing occasions under the same visit", async () => {
  expect(
    (await post({ ...input(), unitIds: [unitIds[0]] }, [files[0]])).status,
  ).toBe(201);

  expect(
    (await post({ ...input(), unitIds: [unitIds[1]] }, [files[1]])).status,
  ).toBe(201);

  expect(
    await db.borrowing.count({
      where: { guestVisitId: visitId },
    }),
  ).toBe(2);
});

it("returns an empty borrowing history with visit wide summary", async () => {
  const response = await getBorrowings();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    visit: { id: visitId },
    summary: {
      totalOccasions: 0,
      totalLines: 0,
      outstandingLines: 0,
      returnedLines: 0,
      settledLines: 0,
      hasOutstanding: false,
    },
    lines: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  await expectNoIssue();
});

it("lists paginated line history and current outstanding lines after checkout", async () => {
  const firstIssue = await post(
    { ...input(), unitIds: [unitIds[0]] },
    [files[0]],
  );
  expect(firstIssue.status).toBe(201);
  const first = await firstIssue.json();
  await db.borrowing.update({
    where: { id: first.borrowing.id },
    data: { issuedAt: new Date("2026-10-26T01:00:00.000Z") },
  });
  await db.borrowingLine.updateMany({
    where: { borrowingId: first.borrowing.id },
    data: { status: "RETURNED", resolvedAt: new Date("2026-10-26T03:00:00.000Z") },
  });
  await db.itemUnit.update({
    where: { id: unitIds[0] },
    data: {
      condition: "DAMAGED",
      readiness: "PENDING_INSPECTION",
      custody: "HOUSEKEEPING",
      locationId,
    },
  });

  const secondIssue = await post(
    { ...input(), unitIds: [unitIds[1]] },
    [files[1]],
  );
  expect(secondIssue.status).toBe(201);
  const second = await secondIssue.json();
  await db.borrowing.update({
    where: { id: second.borrowing.id },
    data: { issuedAt: new Date("2026-10-26T02:00:00.000Z") },
  });
  await db.guestVisit.update({
    where: { id: visitId },
    data: {
      primaryGuestName: "Updated Guest Name",
      normalizedPrimaryGuestName: "updated guest name",
      roomNumber: "0202",
      status: "CHECKED_OUT",
      checkedOutAt: new Date("2026-10-28T00:00:00.000Z"),
    },
  });
  await db.item.update({ where: { id: itemId }, data: { isActive: false } });

  const pageOne = await getBorrowings({ pageSize: "1" });
  expect(pageOne.status).toBe(200);
  const current = await pageOne.json();
  expect(current).toMatchObject({
    visit: {
      id: visitId,
      primaryGuestName: "Updated Guest Name",
      roomNumber: "0202",
      status: "CHECKED_OUT",
    },
    summary: {
      totalOccasions: 2,
      totalLines: 2,
      outstandingLines: 1,
      returnedLines: 1,
      settledLines: 0,
      hasOutstanding: true,
    },
    pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNextPage: true },
  });
  expect(current.lines).toHaveLength(1);
  expect(current.lines[0]).toMatchObject({
    status: "OUTSTANDING",
    conditionAtIssue: "GOOD",
    borrowing: {
      id: second.borrowing.id,
      primaryGuestNameSnapshot: "Issue Guest",
      roomNumberSnapshot: "0101",
    },
    unit: {
      id: unitIds[1],
      custody: "GUEST",
      item: { id: itemId, isActive: false },
    },
  });
  expect(current.lines[0].photos).toHaveLength(1);
  expect(current.lines[0].photos[0]).toMatchObject({
    event: { action: "BORROWING_ISSUED" },
    url: `/api/item-units/${unitIds[1]}/photos/${current.lines[0].photos[0].id}`,
  });
  expect(current.lines[0].photos[0]).not.toHaveProperty("photoKey");
  expect(current.lines[0].borrowing).not.toHaveProperty("requestHash");

  const pageTwo = await getBorrowings({ page: "2", pageSize: "1" });
  const returned = await pageTwo.json();
  expect(returned.lines[0]).toMatchObject({
    status: "RETURNED",
    conditionAtIssue: "GOOD",
    unit: { id: unitIds[0], condition: "DAMAGED", readiness: "PENDING_INSPECTION" },
  });
  expect(returned.pagination).toMatchObject({ hasNextPage: false, total: 2 });

  const outstanding = await getBorrowings({ status: "OUTSTANDING" });
  expect(await outstanding.json()).toMatchObject({
    summary: { totalLines: 2, outstandingLines: 1, returnedLines: 1 },
    pagination: { total: 1, totalPages: 1 },
    lines: [{ status: "OUTSTANDING" }],
  });
  const beyondLastPage = await getBorrowings({ page: "3", pageSize: "1" });
  expect(await beyondLastPage.json()).toMatchObject({
    summary: { totalLines: 2 },
    pagination: { total: 2, hasNextPage: false },
    lines: [],
  });
});

it("counts settled obligations without presenting them as physical returns", async () => {
  const response = await post(input());
  expect(response.status).toBe(201);
  const result = await response.json();
  await db.borrowingLine.updateMany({
    where: { borrowingId: result.borrowing.id },
    data: { status: "SETTLED", resolvedAt: new Date() },
  });

  const all = await getBorrowings();
  expect(await all.json()).toMatchObject({
    summary: {
      totalOccasions: 1,
      totalLines: 2,
      outstandingLines: 0,
      returnedLines: 0,
      settledLines: 2,
      hasOutstanding: false,
    },
    lines: [{ status: "SETTLED" }, { status: "SETTLED" }],
  });
  const returned = await getBorrowings({ status: "RETURNED" });
  expect(await returned.json()).toMatchObject({
    summary: { settledLines: 2 },
    pagination: { total: 0 },
    lines: [],
  });
});

it("keeps borrowing history scoped to one stay, even for the same guest and room", async () => {
  const otherVisit = await db.guestVisit.create({
    data: {
      primaryGuestName: "Issue Guest",
      normalizedPrimaryGuestName: "issue guest",
      roomNumber: "0101",
      bookingNumber: "ANOTHER-STAY",
      checkInDate: new Date("2026-11-01T00:00:00.000Z"),
      plannedCheckoutDate: new Date("2026-11-03T00:00:00.000Z"),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  const originalIssue = await post(
    { ...input(), unitIds: [unitIds[0]] },
    [files[0]],
  );
  const otherIssue = await post(
    {
      requestId: randomUUID(),
      guestVisitId: otherVisit.id,
      unitIds: [unitIds[1]],
    },
    [files[1]],
  );
  expect(originalIssue.status).toBe(201);
  expect(otherIssue.status).toBe(201);

  const original = await getBorrowings();
  expect(await original.json()).toMatchObject({
    summary: { totalOccasions: 1, totalLines: 1 },
    lines: [{ unit: { id: unitIds[0] } }],
  });
  const other = await getBorrowings({}, otherVisit.id);
  expect(await other.json()).toMatchObject({
    visit: { id: otherVisit.id },
    summary: { totalOccasions: 1, totalLines: 1 },
    lines: [{ unit: { id: unitIds[1] } }],
  });
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)(
  "allows borrowing history reads for %s",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await getBorrowings()).status).toBe(200);
  },
);

it.each([
  [{ page: "0" }],
  [{ page: "1.5" }],
  [{ pageSize: "0" }],
  [{ pageSize: "51" }],
  [{ status: "STAYING" }],
  [{}, "not-a-uuid"],
] as const)("rejects invalid borrowing history query input", async (query, id: string = visitId) => {
  const response = await getBorrowings(query, id);
  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it("returns not found for a valid but unknown visit id", async () => {
  const response = await getBorrowings({}, randomUUID());
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each(["SYSTEM_ADMIN"] as const)(
  "rejects borrowing history reads for %s",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await getBorrowings()).status).toBe(403);
  },
);

it("rejects unauthenticated borrowing history reads", async () => {
  mockUser.mockResolvedValue(null);
  const response = await getBorrowings();
  expect(response.status).toBe(401);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

const blockedStates: Prisma.ItemUnitUpdateInput[] = [
  { lifecycle: "RETIRED" },
  { custody: "GUEST" },
  { custody: "ENGINEERING" },
  { custody: "EXTERNAL_VENDOR" },
  { readiness: "ON_HOLD" },
  { readiness: "PENDING_INSPECTION" },
  { readiness: "PENDING_VERIFICATION" },
  { lossState: "MISSING" },
  { lossState: "LOST" },
];

it.each(blockedStates)(
  "rejects the whole selection when one unit is blocked: %j",
  async (state) => {
    await db.itemUnit.update({
      where: { id: unitIds[0] },
      data: state,
    });

    const response = await post(input());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "UNITS_UNAVAILABLE",
    });
    await expectNoIssue();

    expect(
      await db.itemUnit.findUniqueOrThrow({
        where: { id: unitIds[1] },
      }),
    ).toMatchObject({ custody: "HOUSEKEEPING", locationId });
  },
);

it("rejects inactive item types", async () => {
  await db.item.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  const response = await post(input());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "ITEM_INACTIVE" });
  await expectNoIssue();
});

it("rejects checked-out visits", async () => {
  await db.guestVisit.update({
    where: { id: visitId },
    data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
  });

  const response = await post(input());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: "VISIT_NOT_STAYING",
  });
  await expectNoIssue();
});

it("checks outstanding obligations even if custody appears available", async () => {
  await db.borrowing.create({
    data: {
      guestVisitId: visitId,
      requestHash: "a".repeat(64),
      primaryGuestNameSnapshot: "Issue Guest",
      roomNumberSnapshot: "0101",
      issuedById: actor.id,
      lines: {
        create: { unitId: unitIds[0], conditionAtIssue: "GOOD" },
      },
    },
  });

  const response = await post(input());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: "UNITS_UNAVAILABLE",
  });
  expect(
    await db.borrowing.count({
      where: { issuedById: actor.id },
    }),
  ).toBe(1);
});

it("requires fresh upload for every selected unit", async () => {
  const response = await post(input(), [files[0], []]);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "PHOTOS_REQUIRED",
  });
  await expectNoIssue();
});

it("rejects fake image bytes", async () => {
  const fake = new File(["not an image"], "fake.png", {
    type: "image/png",
  });

  const response = await post(input(), [files[0], [fake]]);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: "INVALID_PHOTO" });
  await expectNoIssue();
});

it("allows only one winner for concurrent overlapping requests", async () => {
  const responses = await Promise.all([
    post(input()),
    post({ ...input(), unitIds: [...unitIds].reverse() }),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);

  expect(
    await db.borrowing.count({
      where: { issuedById: actor.id },
    }),
  ).toBe(1);
  expect(
    await db.borrowingLine.count({
      where: { unitId: { in: unitIds } },
    }),
  ).toBe(2);
});

it("replays identical concurrent requests and removes unused staged photos", async () => {
  const keys: string[] = [];
  const store = unitPhotos.storeUnitPhoto;

  vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(async (bytes) => {
    const key = await store(bytes);
    keys.push(key);
    return key;
  });

  const value = input();
  const responses = await Promise.all([post(value), post(value)]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 201,
  ]);

  const persisted = await db.itemUnitPhoto.findMany({
    where: { unitId: { in: unitIds } },
    select: { photoKey: true },
  });
  expect(persisted).toHaveLength(2);

  const referenced = new Set(persisted.map((photo) => photo.photoKey));
  for (const key of keys) {
    if (referenced.has(key)) {
      expect((await unitPhotos.readUnitPhoto(key)).length).toBeGreaterThan(0);
    } else {
      await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  }
});

it("rolls back borrowing and custody when evidence persistence fails", async () => {
  const key = await unitPhotos.storeUnitPhoto(
    await unitPhotos.prepareUnitPhoto(files[0][0]),
  );

  vi.spyOn(unitPhotos, "storeUnitPhoto").mockResolvedValue(key);

  await expect(post(input())).rejects.toThrow();
  await expectNoIssue();

  expect(
    await db.itemUnit.count({
      where: {
        id: { in: unitIds },
        custody: "HOUSEKEEPING",
        locationId,
      },
    }),
  ).toBe(2);

  await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects issuance by %s",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await post(input())).status).toBe(403);
    await expectNoIssue();
  },
);

it("rejects unauthenticated requests", async () => {
  mockUser.mockResolvedValue(null);
  expect((await post(input())).status).toBe(401);
  await expectNoIssue();
});

it("rejects untrusted origins", async () => {
  expect((await post(input(), files, "https://untrusted.example")).status).toBe(
    403,
  );
  await expectNoIssue();
});

it("rejects JSON requests without multipart uploads", async () => {
  const response = await POST(
    new Request("http://localhost/api/borrowings", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input()),
    }),
  );

  expect(response.status).toBe(415);
  await expectNoIssue();
});
