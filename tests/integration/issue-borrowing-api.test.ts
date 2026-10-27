import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Prisma } from "../../src/generated/prisma/client";
import { POST } from "../../src/app/api/borrowings/route";
import { POST as POST_RETURN } from "../../src/app/api/returns/route";
import { POST as POST_CHECKOUT } from "../../src/app/api/guest-visits/[visitId]/checkout/route";
import { PATCH as PATCH_VISIT } from "../../src/app/api/guest-visits/[visitId]/route";
import { GET as GET_BORROWINGS } from "../../src/app/api/guest-visits/[visitId]/borrowings/route";
import { POST as POST_DAMAGE_REPORT } from "../../src/app/api/item-unit-damage-reports/route";
import { POST as POST_VERIFICATION } from "../../src/app/api/unit-verifications/route";
import { GET as GET_UNIT_HISTORY } from "../../src/app/api/item-units/[unitId]/history/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";
import { getItemUnits } from "../../src/server/item-units";
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

function returnInput(borrowingLineIds: string[]) {
  return {
    requestId: randomUUID(),
    guestVisitId: visitId,
    defaultLocationId: locationId,
    lines: borrowingLineIds.map((borrowingLineId) => ({ borrowingLineId })),
  };
}

function postReturn(
  body: unknown,
  photos: File[][] = [],
  origin = "http://localhost:3000",
) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  photos.forEach((group, index) => {
    group.forEach((file) => form.append(`photo-${index}`, file));
  });

  return POST_RETURN(
    new Request("http://localhost/api/returns", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    }),
  );
}

async function issueForReturn() {
  const response = await post(input());
  expect(response.status).toBe(201);
  const result = await response.json();
  return result.borrowing.lines as { id: string; unitId: string }[];
}

async function prepareDamageReportUnit() {
  const lines = await issueForReturn();
  const line = lines.find((entry) => entry.unitId === unitIds[0]);
  if (!line) throw new Error("Expected borrowing line for the damage-report unit");
  const returned = await postReturn(returnInput([line.id]));
  expect(returned.status).toBe(201);
  return line;
}

function postCheckout(body: unknown = {}) {
  return POST_CHECKOUT(
    new Request(`http://localhost/api/guest-visits/${visitId}/checkout`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ visitId }) },
  );
}

function postDamage(
  body: unknown,
  photos: File[] = [],
  origin = "http://localhost:3000",
) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  for (const file of photos) form.append("photo-0", file);

  return POST_DAMAGE_REPORT(
    new Request("http://localhost/api/item-unit-damage-reports", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    }),
  );
}

function damageInput() {
  return {
    requestId: randomUUID(),
    unitId: unitIds[0],
    condition: "DAMAGED",
    notes: "Kerusakan ditemukan saat pemeriksaan ulang.",
  };
}

function postVerification(
  body: unknown,
  photos: File[][] = files,
  origin = "http://localhost:3000",
) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));

  photos.forEach((group, index) => {
    group.forEach((file) => form.append(`photo-${index}`, file));
  });

  return POST_VERIFICATION(
    new Request("http://localhost/api/unit-verifications", {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    }),
  );
}

async function prepareVerificationInput(
  result: "FIT_FOR_USE" | "UNFIT_FOR_USE" = "FIT_FOR_USE",
) {
  await db.itemUnit.updateMany({
    where: { id: { in: unitIds } },
    data: { condition: "MINOR_DAMAGE", readiness: "ON_HOLD" },
  });

  const units = await db.itemUnit.findMany({
    where: { id: { in: unitIds } },
    orderBy: { id: "asc" },
    select: { id: true, updatedAt: true },
  });

  return {
    requestId: randomUUID(),
    units: units.map((unit) => ({
      unitId: unit.id,
      expectedUpdatedAt: unit.updatedAt.toISOString(),
      result,
      notes: "Hasil pemeriksaan fisik oleh Supervisor.",
    })),
  };
}

function getUnitHistory(targetUnitId: string) {
  const query = new URLSearchParams({ page: "1", pageSize: "10" });
  return GET_UNIT_HISTORY(
    new Request(
      `http://localhost/api/item-units/${targetUnitId}/history?${query}`,
    ),
    { params: Promise.resolve({ unitId: targetUnitId }) },
  );
}

function patchVisit(body: unknown) {
  return PATCH_VISIT(
    new Request(`http://localhost/api/guest-visits/${visitId}`, {
      method: "PATCH",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ visitId }) },
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
    await tx.returnLine.deleteMany({
      where: { returnBatch: { guestVisit: { createdById: actor.id } } },
    });
    await tx.returnBatch.deleteMany({
      where: { guestVisit: { createdById: actor.id } },
    });
    await tx.borrowingLine.deleteMany({
      where: { borrowing: { issuedById: actor.id } },
    });
    await tx.borrowing.deleteMany({ where: { issuedById: actor.id } });
    await tx.itemUnit.deleteMany({ where: { createdById: actor.id } });
    await tx.item.deleteMany({ where: { createdById: actor.id } });
    await tx.guestVisit.deleteMany({ where: { createdById: actor.id } });
    await tx.location.deleteMany({
      where: {
        OR: [
          { id: locationId },
          { code: `RETURN-${actor.id}` },
        ],
      },
    });
    await tx.user.delete({ where: { id: actor.id } });
  });

  await Promise.all(
    photos.map((photo) => unitPhotos.removeUnitPhoto(photo.photoKey)),
  );
  vi.unstubAllEnvs();
});

afterAll(() => db.$disconnect());

it("keeps issued guest snapshots after primary guest and room are corrected", async () => {
  const firstInput = input();
  const firstResponse = await post(
    { ...firstInput, unitIds: [unitIds[0]] },
    [files[0]],
  );
  expect(firstResponse.status).toBe(201);
  const first = await firstResponse.json();

  const currentVisit = await db.guestVisit.findUniqueOrThrow({
    where: { id: visitId },
  });
  const correction = await patchVisit({
    expectedUpdatedAt: currentVisit.updatedAt.toISOString(),
    primaryGuestName: "Corrected Issue Guest",
    roomNumber: "0102",
    reason: "Koreksi berdasarkan data registrasi terbaru.",
  });
  expect(correction.status).toBe(200);
  expect(
    await db.borrowing.findUniqueOrThrow({ where: { id: first.borrowing.id } }),
  ).toMatchObject({
    primaryGuestNameSnapshot: "Issue Guest",
    roomNumberSnapshot: "0101",
  });

  const secondInput = input();
  const secondResponse = await post(
    { ...secondInput, unitIds: [unitIds[1]] },
    [files[1]],
  );
  expect(secondResponse.status).toBe(201);
  const second = await secondResponse.json();
  expect(second.borrowing).toMatchObject({
    primaryGuestNameSnapshot: "Corrected Issue Guest",
    roomNumberSnapshot: "0102",
  });
});

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

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "returns selected units partially and records the authenticated receiver for %s",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    const issued = await issueForReturn();

    const first = await postReturn(returnInput([issued[0].id]));
    expect(first.status).toBe(201);
    const firstResult = await first.json();
    expect(firstResult).toMatchObject({
      replayed: false,
      receipt: {
        id: expect.any(String),
        guestVisitId: visitId,
        receivedBy: { id: actor.id },
        lines: [{ borrowingLineId: issued[0].id, condition: "GOOD", locationId }],
      },
    });
    expect(firstResult.receipt).not.toHaveProperty("requestHash");

    expect(await db.borrowingLine.count({ where: { id: issued[0].id, status: "RETURNED" } })).toBe(1);
    expect(await db.borrowingLine.count({ where: { id: issued[1].id, status: "OUTSTANDING" } })).toBe(1);
    expect(await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } })).toMatchObject({
      custody: "HOUSEKEEPING",
      condition: "GOOD",
      readiness: "CLEAR",
      locationId,
    });

    const history = await getBorrowings();
    expect(await history.json()).toMatchObject({
      summary: { outstandingLines: 1, returnedLines: 1 },
    });

    const second = await postReturn(returnInput([issued[1].id]));
    expect(second.status).toBe(201);
    expect(await db.borrowingLine.count({ where: { status: "OUTSTANDING", borrowing: { guestVisitId: visitId } } })).toBe(0);
  },
);

it("combines borrowing occasions after checkout, saves per-line location and damage evidence", async () => {
  const firstIssue = await post({ ...input(), unitIds: [unitIds[0]] }, [files[0]]);
  const secondIssue = await post(
    { requestId: randomUUID(), guestVisitId: visitId, unitIds: [unitIds[1]] },
    [files[1]],
  );
  expect(firstIssue.status).toBe(201);
  expect(secondIssue.status).toBe(201);
  const [firstLine] = (await firstIssue.json()).borrowing.lines;
  const [secondLine] = (await secondIssue.json()).borrowing.lines;
  const override = await db.location.create({
    data: { code: `RETURN-${actor.id}`, name: "Return inspection" },
  });
  await db.guestVisit.update({
    where: { id: visitId },
    data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
  });
  await db.item.update({ where: { id: itemId }, data: { isActive: false } });

  const body = {
    ...returnInput([firstLine.id, secondLine.id]),
    lines: [
      { borrowingLineId: firstLine.id },
      { borrowingLineId: secondLine.id, condition: "DAMAGED" as const, locationId: override.id },
    ],
  };
  const response = await postReturn(body, [[], [files[1][0], files[0][0]]]);
  expect(response.status).toBe(201);

  const damaged = await db.itemUnit.findUniqueOrThrow({ where: { id: unitIds[1] } });
  expect(damaged).toMatchObject({
    custody: "HOUSEKEEPING",
    condition: "DAMAGED",
    readiness: "PENDING_INSPECTION",
    locationId: override.id,
  });

  const historyResponse = await getBorrowings();
  const history = await historyResponse.json();
  expect(history.summary).toMatchObject({ totalOccasions: 2, returnedLines: 2, outstandingLines: 0 });
  expect(history.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({
      returnLine: expect.objectContaining({
        condition: "GOOD",
        location: expect.objectContaining({ id: locationId }),
      }),
    }),
    expect.objectContaining({
      returnLine: expect.objectContaining({
        condition: "DAMAGED",
        location: expect.objectContaining({ id: override.id, code: override.code }),
        returnBatch: expect.objectContaining({
          receivedBy: expect.objectContaining({ id: actor.id }),
        }),
      }),
      photos: expect.arrayContaining([
        expect.objectContaining({
          returnLineId: expect.any(String),
          event: expect.objectContaining({
            action: "BORROWING_RETURNED",
            createdAt: expect.any(String),
            id: expect.any(String),
          }),
        }),
      ]),
    }),
  ]));
  expect(await db.itemUnitPhoto.count({ where: { unitId: unitIds[1], returnLineId: { not: null } } })).toBe(2);
  expect(await db.itemUnitPhoto.count({ where: { unitId: unitIds[1], returnLineId: null } })).toBe(1);
});

it("preserves an existing hold when a returned unit is in good condition", async () => {
  const issued = await issueForReturn();
  await db.itemUnit.update({ where: { id: issued[0].unitId }, data: { readiness: "ON_HOLD" } });

  const response = await postReturn(returnInput([issued[0].id]));
  expect(response.status).toBe(201);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } })).toMatchObject({
    custody: "HOUSEKEEPING",
    readiness: "ON_HOLD",
  });
});

it("rejects non-good returns without photos and invalid photo bytes atomically", async () => {
  const issued = await issueForReturn();
  const noPhoto = {
    ...returnInput([issued[0].id]),
    lines: [{ borrowingLineId: issued[0].id, condition: "DAMAGED" as const }],
  };
  const missing = await postReturn(noPhoto);
  expect(missing.status).toBe(400);
  expect(await missing.json()).toMatchObject({ error: "PHOTOS_REQUIRED" });

  const fake = new File(["not an image"], "bad.png", { type: "image/png" });
  const invalid = await postReturn(noPhoto, [[fake]]);
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: "INVALID_PHOTO" });
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(0);
  expect(await db.borrowingLine.count({ where: { id: { in: issued.map((line) => line.id) }, status: "OUTSTANDING" } })).toBe(2);
});

it("rejects the whole return when any line is not outstanding for this visit", async () => {
  const issued = await issueForReturn();
  const response = await postReturn(returnInput([issued[0].id, randomUUID()]));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "LINES_UNAVAILABLE" });
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(0);
  expect(await db.itemUnit.count({ where: { id: { in: unitIds }, custody: "GUEST" } })).toBe(2);
});

it("does not allow a return line from another guest visit", async () => {
  const otherVisit = await db.guestVisit.create({
    data: {
      primaryGuestName: "Different Visit",
      normalizedPrimaryGuestName: "different visit",
      roomNumber: "0202",
      bookingNumber: "RETURN-OTHER-VISIT",
      checkInDate: new Date("2026-11-01T00:00:00Z"),
      plannedCheckoutDate: new Date("2026-11-03T00:00:00Z"),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  const otherIssue = await post(
    { requestId: randomUUID(), guestVisitId: otherVisit.id, unitIds: [unitIds[1]] },
    [files[1]],
  );
  expect(otherIssue.status).toBe(201);
  const [otherLine] = (await otherIssue.json()).borrowing.lines;

  const response = await postReturn(returnInput([otherLine.id]));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "LINES_UNAVAILABLE" });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: otherLine.id } })).toMatchObject({ status: "OUTSTANDING" });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: unitIds[1] } })).toMatchObject({ custody: "GUEST" });
});

it("rejects inactive and WITH_GUEST receiving locations", async () => {
  const issued = await issueForReturn();
  await db.location.update({ where: { id: locationId }, data: { isActive: false } });
  const inactive = await postReturn(returnInput([issued[0].id]));
  expect(inactive.status).toBe(409);
  expect(await inactive.json()).toMatchObject({ error: "LOCATION_UNAVAILABLE" });

  const withGuest = await db.location.findUniqueOrThrow({ where: { code: "WITH_GUEST" } });
  const invalidDestination = returnInput([issued[0].id]);
  invalidDestination.defaultLocationId = withGuest.id;
  const rejected = await postReturn(invalidDestination);
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({ error: "LOCATION_UNAVAILABLE" });
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(0);
});

it("allows only one concurrent return for the same outstanding units", async () => {
  const issued = await issueForReturn();
  const responses = await Promise.all([
    postReturn(returnInput([issued[0].id])),
    postReturn(returnInput([issued[0].id])),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(1);
  expect(await db.borrowingLine.count({ where: { id: issued[0].id, status: "RETURNED" } })).toBe(1);
});

it("replays the same return without overwriting later unit state and rejects request reuse", async () => {
  const issued = await issueForReturn();
  const body = returnInput([issued[0].id]);
  const first = await postReturn(body);
  expect(first.status).toBe(201);
  const saved = await first.json();
  await db.itemUnit.update({ where: { id: issued[0].unitId }, data: { readiness: "ON_HOLD" } });

  const retry = await postReturn(body);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ...saved, replayed: true });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } })).toMatchObject({ readiness: "ON_HOLD" });

  const conflict = await postReturn({ ...body, defaultLocationId: randomUUID() });
  expect(conflict.status).toBe(409);
  expect(await conflict.json()).toMatchObject({ error: "REQUEST_CONFLICT" });
});

it("rolls back all return changes and removes staged photos when evidence persistence fails", async () => {
  const issued = await issueForReturn();
  const key = await unitPhotos.storeUnitPhoto(
    await unitPhotos.prepareUnitPhoto(files[0][0]),
  );
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockResolvedValue(key);
  const body = {
    ...returnInput(issued.map((line) => line.id)),
    lines: issued.map((line) => ({
      borrowingLineId: line.id,
      condition: "DAMAGED" as const,
    })),
  };

  await expect(postReturn(body, files)).rejects.toThrow();
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(0);
  expect(await db.borrowingLine.count({ where: { id: { in: issued.map((line) => line.id) }, status: "OUTSTANDING" } })).toBe(2);
  expect(await db.itemUnit.count({ where: { id: { in: unitIds }, custody: "GUEST" } })).toBe(2);
  await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves return evidence when the transaction committed but its response was lost", async () => {
  const issued = await issueForReturn();
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Expected interactive transaction");
    await transact(callback as (tx: Prisma.TransactionClient) => Promise<unknown>);
    throw new Error("Simulated lost transaction response");
  });
  const body = returnInput([issued[0].id]);
  const returnPhoto = [[files[0][0]]];

  await expect(postReturn(body, returnPhoto)).rejects.toThrow("Simulated lost transaction response");
  const savedLine = await db.returnLine.findUniqueOrThrow({
    where: { borrowingLineId: issued[0].id },
    include: { photos: true },
  });
  expect(savedLine.photos).toHaveLength(1);
  expect((await unitPhotos.readUnitPhoto(savedLine.photos[0].photoKey)).length).toBeGreaterThan(0);

  const retry = await postReturn(body, returnPhoto);
  expect(retry.status).toBe(200);
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(1);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects return processing by %s",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    const response = await postReturn(returnInput([randomUUID()]));
    expect(response.status).toBe(403);
  },
);

it("rejects unauthenticated and untrusted-origin return requests", async () => {
  mockUser.mockResolvedValue(null);
  expect((await postReturn(returnInput([randomUUID()]))).status).toBe(401);
  mockUser.mockResolvedValue(actor);
  expect((await postReturn(returnInput([randomUUID()]), [], "https://untrusted.example")).status).toBe(403);
});

it("requires checkout acknowledgement for outstanding units and preserves their obligations", async () => {
  const issued = await issueForReturn();
  const unitsBefore = await db.itemUnit.findMany({
    where: { id: { in: unitIds } }, orderBy: { id: "asc" },
  });
  const linesBefore = await db.borrowingLine.findMany({
    where: { unitId: { in: unitIds } }, orderBy: { id: "asc" },
  });
  const warning = await postCheckout();
  expect(warning.status).toBe(409);
  expect(await warning.json()).toMatchObject({ error: "OUTSTANDING_BORROWINGS", outstandingLines: 2 });
  expect(await db.guestVisit.findUniqueOrThrow({ where: { id: visitId } })).toMatchObject({
    status: "STAYING", checkedOutAt: null,
  });

  const confirmed = await postCheckout({ acknowledgeOutstanding: true });
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toMatchObject({
    visit: { status: "CHECKED_OUT" }, outstandingLines: 2,
  });
  expect(await db.itemUnit.findMany({
    where: { id: { in: unitIds } }, orderBy: { id: "asc" },
  })).toEqual(unitsBefore);
  expect(await db.borrowingLine.findMany({
    where: { unitId: { in: unitIds } }, orderBy: { id: "asc" },
  })).toEqual(linesBefore);
  expect(await db.auditEvent.findFirstOrThrow({
    where: { entityId: visitId, action: "GUEST_VISIT_CHECKED_OUT" },
  })).toMatchObject({
    newValues: { outstandingLines: 2, acknowledgedOutstanding: true },
  });
  const rejectedIssue = await post(input());
  expect(rejectedIssue.status).toBe(409);
  expect(await rejectedIssue.json()).toMatchObject({ error: "VISIT_NOT_STAYING" });
  expect((await postReturn(returnInput([issued[0].id]))).status).toBe(201);
  expect(await (await getBorrowings()).json()).toMatchObject({
    visit: { status: "CHECKED_OUT" },
    summary: { outstandingLines: 1, returnedLines: 1 },
  });
});

it("serializes checkout with a concurrent borrowing issue", async () => {
  const [issue, checkout] = await Promise.all([post(input()), postCheckout()]);
  expect([201, 409]).toContain(issue.status);
  expect(checkout.status).toBe(issue.status === 201 ? 409 : 200);
  const visit = await db.guestVisit.findUniqueOrThrow({ where: { id: visitId } });
  const outstanding = await db.borrowingLine.count({
    where: { borrowing: { guestVisitId: visitId }, status: "OUTSTANDING" },
  });
  expect(visit.status).toBe(issue.status === 201 ? "STAYING" : "CHECKED_OUT");
  expect(outstanding).toBe(issue.status === 201 ? 2 : 0);
});

it("holds newly discovered damage without rewriting a finalized GOOD return", async () => {
  const returnedUnit = await prepareDamageReportUnit();

  const returnedBefore = await db.returnLine.findUniqueOrThrow({
    where: { borrowingLineId: returnedUnit.id },
  });
  const unitBefore = await db.itemUnit.findUniqueOrThrow({
    where: { id: returnedUnit.unitId },
  });

  expect(unitBefore).toMatchObject({
    condition: "GOOD",
    readiness: "CLEAR",
    custody: "HOUSEKEEPING",
  });

  const body = { ...damageInput(), unitId: returnedUnit.unitId };
  const response = await postDamage(body, [files[0][0], files[1][0]]);

  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");

  const saved = await response.json();
  expect(saved).toMatchObject({
    replayed: false,
    report: {
      id: body.requestId,
      unitId: returnedUnit.unitId,
      notes: body.notes,
      reportedBy: { id: actor.id },
    },
  });
  expect(saved.report.photos).toHaveLength(2);

  const after = await db.itemUnit.findUniqueOrThrow({
    where: { id: returnedUnit.unitId },
  });
  expect(after).toEqual({
    ...unitBefore,
    condition: "DAMAGED",
    readiness: "ON_HOLD",
    updatedAt: expect.any(Date),
  });

  expect(
    await db.returnLine.findUniqueOrThrow({
      where: { borrowingLineId: returnedUnit.id },
    }),
  ).toEqual(returnedBefore);
  expect(
    await db.borrowingLine.findUniqueOrThrow({
      where: { id: returnedUnit.id },
    }),
  ).toMatchObject({ status: "RETURNED" });

  expect(
    await db.auditEvent.findUniqueOrThrow({
      where: { id: body.requestId },
    }),
  ).toMatchObject({
    action: "ITEM_UNIT_DAMAGE_REPORTED",
    actorId: actor.id,
    oldValues: { condition: "GOOD", readiness: "CLEAR" },
    newValues: { condition: "DAMAGED", readiness: "ON_HOLD" },
  });

  const evidence = await db.itemUnitPhoto.findMany({
    where: { auditEventId: body.requestId },
  });
  expect(evidence).toHaveLength(2);
  for (const photo of evidence) {
    expect(photo).toMatchObject({
      unitId: returnedUnit.unitId,
      borrowingLineId: null,
      returnLineId: null,
    });
    expect(
      (await unitPhotos.readUnitPhoto(photo.photoKey)).length,
    ).toBeGreaterThan(0);
  }

  const history = await (await getUnitHistory(returnedUnit.unitId)).json();
  const reportEvent = history.events.find(
    (event: { id: string }) => event.id === body.requestId,
  );
  expect(reportEvent).toMatchObject({
    action: "ITEM_UNIT_DAMAGE_REPORTED",
    reason: body.notes,
    newValues: { condition: "DAMAGED", readiness: "ON_HOLD" },
  });
  expect(reportEvent.newValues).not.toHaveProperty("requestHash");
  expect(reportEvent.photos).toHaveLength(2);

  const ready = await getItemUnits(itemId, undefined, true);
  expect(ready?.units.map((unit) => unit.id)).not.toContain(
    returnedUnit.unitId,
  );
});

it("replays a damage report without resetting later unit state", async () => {
  await prepareDamageReportUnit();
  const body = damageInput();
  const first = await postDamage(body, [files[0][0]]);
  expect(first.status).toBe(201);
  const saved = await first.json();

  await db.itemUnit.update({
    where: { id: body.unitId },
    data: { readiness: "PENDING_VERIFICATION" },
  });

  const retry = await postDamage(body, [files[0][0]]);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ...saved, replayed: true });
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } }),
  ).toMatchObject({ readiness: "PENDING_VERIFICATION" });
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(1);
  expect(
    (
      await postDamage(
        { ...body, notes: "Payload berbeda." },
        [files[0][0]],
      )
    ).status,
  ).toBe(409);
});

it("serializes concurrent retries into one damage report and evidence set", async () => {
  await prepareDamageReportUnit();
  const body = damageInput();
  const responses = await Promise.all([
    postDamage(body, [files[0][0]]),
    postDamage(body, [files[0][0]]),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    200,
    201,
  ]);
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(1);
  expect(
    await db.itemUnitPhoto.count({
      where: { auditEventId: body.requestId },
    }),
  ).toBe(1);
});

it("rejects damage reporting for a unit still borrowed by a guest", async () => {
  const issued = await issueForReturn();
  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: issued[0].unitId },
  });

  const response = await postDamage({
    ...damageInput(),
    unitId: issued[0].unitId,
  });

  expect(response.status).toBe(409);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } }),
  ).toEqual(before);
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: issued[0].id } }),
  ).toMatchObject({ status: "OUTSTANDING" });
});

it("requires a finalized GOOD return before reporting post-return damage", async () => {
  const body = damageInput();
  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: body.unitId },
  });

  expect((await postDamage(body)).status).toBe(409);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } }),
  ).toEqual(before);
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(0);
});

it("serializes damage reporting with a concurrent borrowing issue", async () => {
  await prepareDamageReportUnit();
  const body = damageInput();
  const [report, issue] = await Promise.all([
    postDamage(body),
    post({ ...input(), unitIds: [unitIds[0]] }, [files[0]]),
  ]);

  expect([201, 409]).toContain(report.status);
  expect(issue.status).toBe(report.status === 201 ? 409 : 201);

  const unit = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitIds[0] },
  });
  expect(unit).toMatchObject(
    report.status === 201
      ? {
          custody: "HOUSEKEEPING",
          readiness: "ON_HOLD",
          condition: "DAMAGED",
        }
      : {
          custody: "GUEST",
          readiness: "CLEAR",
          condition: "GOOD",
        },
  );
  expect(
    await db.borrowingLine.count({
      where: { unitId: unitIds[0], status: "OUTSTANDING" },
    }),
  ).toBe(report.status === 201 ? 0 : 1);
});

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "allows damage reporting by %s",
  async (role) => {
    await prepareDamageReportUnit();
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await postDamage(damageInput())).status).toBe(201);
  },
);

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "rejects damage reporting by %s",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await postDamage(damageInput())).status).toBe(403);
  },
);

it("validates damage reports, photo bytes, authentication and origin", async () => {
  const body = damageInput();
  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: body.unitId },
  });

  mockUser.mockResolvedValue(null);
  expect((await postDamage(body)).status).toBe(401);
  mockUser.mockResolvedValue(actor);

  expect(
    (await postDamage(body, [], "https://untrusted.example")).status,
  ).toBe(403);
  expect(
    (await postDamage({ ...body, condition: "GOOD" })).status,
  ).toBe(400);
  expect((await postDamage({ ...body, notes: " " })).status).toBe(400);
  expect(
    (await postDamage({ ...body, notes: "x".repeat(256 * 1024) })).status,
  ).toBe(413);
  expect(
    (
      await postDamage(body, [
        new File(["not an image"], "fake.png", { type: "image/png" }),
      ])
    ).status,
  ).toBe(400);
  expect(
    (await postDamage({ ...body, unitId: randomUUID() })).status,
  ).toBe(404);

  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } }),
  ).toEqual(before);
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(0);
});

it("rolls back the damage hold and removes staged photos when evidence persistence fails", async () => {
  await prepareDamageReportUnit();
  const body = damageInput();
  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: body.unitId },
  });

  const key = await unitPhotos.storeUnitPhoto(
    await unitPhotos.prepareUnitPhoto(files[0][0]),
  );
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockResolvedValue(key);

  await expect(
    postDamage(body, [files[0][0], files[1][0]]),
  ).rejects.toThrow();

  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } }),
  ).toEqual(before);
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(0);
  await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("preserves committed damage evidence when the transaction response is lost", async () => {
  await prepareDamageReportUnit();
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(
    async (callback: unknown) => {
      if (typeof callback !== "function") {
        throw new Error("Expected interactive transaction");
      }

      await transact(
        callback as (
          tx: Prisma.TransactionClient,
        ) => Promise<unknown>,
      );
      throw new Error("Simulated lost transaction response");
    },
  );

  const body = damageInput();
  await expect(
    postDamage(body, [files[0][0]]),
  ).rejects.toThrow("Simulated lost transaction response");

  const evidence = await db.itemUnitPhoto.findFirstOrThrow({
    where: { auditEventId: body.requestId },
  });
  expect(
    (await unitPhotos.readUnitPhoto(evidence.photoKey)).length,
  ).toBeGreaterThan(0);

  const retry = await postDamage(body, [files[0][0]]);
  expect(retry.status).toBe(200);
  expect(
    await db.itemUnitPhoto.count({
      where: { auditEventId: body.requestId },
    }),
  ).toBe(1);
});

it("saves individual verification results and photo evidence atomically", async () => {
  const body = await prepareVerificationInput();
  body.units[1].result = "UNFIT_FOR_USE";
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  const response = await postVerification(body);
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");

  const saved = await response.json();
  expect(saved).toMatchObject({
    replayed: false,
    verification: {
      id: body.requestId,
      verifiedBy: { id: actor.id },
    },
  });
  expect(saved.verification.units).toHaveLength(2);

  for (const [index, line] of body.units.entries()) {
    const readiness = index === 0 ? "CLEAR" : "ON_HOLD";

    expect(
      await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
    ).toMatchObject({
      condition: "MINOR_DAMAGE",
      readiness,
      custody: "HOUSEKEEPING",
      lifecycle: "ACTIVE",
      locationId,
    });

    const history = await (await getUnitHistory(line.unitId)).json();
    const event = history.events.find(
      (entry: { action: string }) => entry.action === "ITEM_UNIT_VERIFIED",
    );

    expect(event).toMatchObject({
      reason: line.notes,
      actor: { id: actor.id },
      newValues: {
        verificationId: body.requestId,
        result: line.result,
        condition: "MINOR_DAMAGE",
        readiness,
      },
    });
    expect(event.newValues).not.toHaveProperty("requestHash");
    expect(event.photos).toHaveLength(1);
  }

  const ready = await getItemUnits(itemId, undefined, true);
  expect(ready?.units.map((unit) => unit.id)).toContain(body.units[0].unitId);
  expect(ready?.units.map((unit) => unit.id)).not.toContain(body.units[1].unitId);
});

it("replays verification without overwriting later unit state", async () => {
  const body = await prepareVerificationInput();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  const first = await postVerification(body);
  expect(first.status).toBe(201);
  const saved = await first.json();

  await db.itemUnit.updateMany({
    where: { id: { in: unitIds } },
    data: { readiness: "ON_HOLD" },
  });

  const retry = await postVerification(body);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ...saved, replayed: true });
  expect(
    await db.itemUnit.count({
      where: { id: { in: unitIds }, readiness: "ON_HOLD" },
    }),
  ).toBe(2);

  const changed = {
    ...body,
    units: body.units.map((unit) => ({ ...unit, notes: "Payload diubah." })),
  };
  expect((await postVerification(changed)).status).toBe(409);
});

it("rejects missing photos and stale verification snapshots", async () => {
  const body = await prepareVerificationInput();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  expect((await postVerification(body, [])).status).toBe(400);
  expect((await postVerification(body, [files[0], []])).status).toBe(400);

  await db.itemUnit.update({
    where: { id: body.units[0].unitId },
    data: {
      updatedAt: new Date(
        new Date(body.units[0].expectedUpdatedAt).getTime() + 1000,
      ),
    },
  });

  const stale = await postVerification(body);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: "STALE_UNIT" });
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(0);
});

it("rejects the whole verification batch when one unit is ineligible", async () => {
  const body = await prepareVerificationInput();

  await db.itemUnit.update({
    where: { id: body.units[1].unitId },
    data: { lossState: "MISSING" },
  });

  const before = await db.itemUnit.findMany({
    where: { id: { in: unitIds } },
    orderBy: { id: "asc" },
  });
  body.units = body.units.map((line) => ({
    ...line,
    expectedUpdatedAt: before
      .find((unit) => unit.id === line.unitId)!
      .updatedAt.toISOString(),
  }));
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  expect((await postVerification(body)).status).toBe(409);
  expect(
    await db.itemUnit.findMany({
      where: { id: { in: unitIds } },
      orderBy: { id: "asc" },
    }),
  ).toEqual(before);
  expect(
    await db.auditEvent.count({
      where: { actorId: actor.id, action: "ITEM_UNIT_VERIFIED" },
    }),
  ).toBe(0);
});

it("serializes verification retries and rejects a stale new round", async () => {
  const body = await prepareVerificationInput();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  const responses = await Promise.all([
    postVerification(body),
    postVerification(body),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200,
    201,
  ]);
  expect(
    await db.auditEvent.count({
      where: { actorId: actor.id, action: "ITEM_UNIT_VERIFIED" },
    }),
  ).toBe(2);

  const stale = await postVerification({ ...body, requestId: randomUUID() });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toMatchObject({ error: "STALE_UNIT" });
});

it("keeps Engineering custody after a passing verification", async () => {
  const body = await prepareVerificationInput();
  await db.itemUnit.updateMany({
    where: { id: { in: unitIds } },
    data: { custody: "ENGINEERING" },
  });

  const current = await db.itemUnit.findMany({
    where: { id: { in: unitIds } },
    select: { id: true, updatedAt: true },
  });
  body.units = body.units.map((line) => ({
    ...line,
    expectedUpdatedAt: current
      .find((unit) => unit.id === line.unitId)!
      .updatedAt.toISOString(),
  }));
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  expect((await postVerification(body)).status).toBe(201);
  expect(
    await db.itemUnit.count({
      where: {
        id: { in: unitIds },
        custody: "ENGINEERING",
        readiness: "CLEAR",
      },
    }),
  ).toBe(2);
  expect((await getItemUnits(itemId, undefined, true))?.units).toHaveLength(0);
});

it.each(["HK_STAFF", "MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "denies Supervisor verification to %s",
  async (role) => {
    const body = await prepareVerificationInput();
    mockUser.mockResolvedValue({ ...actor, roles: [role] });

    expect((await postVerification(body)).status).toBe(403);
    expect(
      await db.auditEvent.count({ where: { id: body.requestId } }),
    ).toBe(0);
  },
);

it("preserves committed verification evidence after a lost response", async () => {
  const body = await prepareVerificationInput();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(
    async (callback: unknown) => {
      if (typeof callback !== "function") {
        throw new Error("Expected interactive transaction");
      }

      await transact(
        callback as (tx: Prisma.TransactionClient) => Promise<unknown>,
      );
      throw new Error("Simulated lost verification response");
    },
  );

  await expect(postVerification(body)).rejects.toThrow(
    "Simulated lost verification response",
  );

  const events = await db.auditEvent.findMany({
    where: { actorId: actor.id, action: "ITEM_UNIT_VERIFIED" },
    select: { id: true },
  });
  const evidence = await db.itemUnitPhoto.findMany({
    where: { auditEventId: { in: events.map((event) => event.id) } },
  });

  expect(evidence).toHaveLength(2);
  for (const photo of evidence) {
    expect(
      (await unitPhotos.readUnitPhoto(photo.photoKey)).length,
    ).toBeGreaterThan(0);
  }

  expect((await postVerification(body)).status).toBe(200);
});
