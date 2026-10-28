import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Prisma } from "../../src/generated/prisma/client";
import { POST } from "../../src/app/api/borrowings/route";
import { POST as POST_RETURN } from "../../src/app/api/returns/route";
import {
  GET as GET_LOSS_REPORTS,
  POST as POST_LOSS_REPORT,
} from "../../src/app/api/borrowing-loss-reports/route";
import { POST as POST_LOSS_DECISION } from "../../src/app/api/borrowing-loss-reports/[reportId]/decision/route";
import { GET as GET_LOSS_REPORT } from "../../src/app/api/borrowing-loss-reports/[reportId]/route";
import { POST as POST_COMPENSATION } from "../../src/app/api/borrowing-loss-reports/[reportId]/compensations/route";
import { POST as POST_COMPENSATION_DECISION } from "../../src/app/api/borrowing-loss-reports/[reportId]/compensations/[settlementId]/decision/route";
import { POST as POST_REPLACEMENT } from "../../src/app/api/borrowing-loss-reports/[reportId]/replacements/route";
import { POST as POST_REPLACEMENT_DECISION } from "../../src/app/api/borrowing-loss-reports/[reportId]/replacements/[settlementId]/decision/route";
import { POST as POST_WRITE_OFF } from "../../src/app/api/borrowing-loss-reports/[reportId]/write-offs/route";
import { POST as POST_WRITE_OFF_DECISION } from "../../src/app/api/borrowing-loss-reports/[reportId]/write-offs/[settlementId]/decision/route";
import { GET as GET_SETTLEMENT_PHOTO } from "../../src/app/api/borrowing-loss-reports/[reportId]/settlements/[settlementId]/photos/[photoId]/route";
import {
  GET as GET_LOSS_RECOVERY,
  POST as POST_LOSS_RECOVERY,
} from "../../src/app/api/borrowing-loss-reports/[reportId]/recovery/route";
import { POST as POST_CHECKOUT } from "../../src/app/api/guest-visits/[visitId]/checkout/route";
import { PATCH as PATCH_VISIT } from "../../src/app/api/guest-visits/[visitId]/route";
import { GET as GET_BORROWINGS } from "../../src/app/api/guest-visits/[visitId]/borrowings/route";
import { POST as POST_DAMAGE_REPORT } from "../../src/app/api/item-unit-damage-reports/route";
import { POST as POST_CONDITION_UPDATE } from "../../src/app/api/item-unit-condition-updates/route";
import { POST as POST_VERIFICATION } from "../../src/app/api/unit-verifications/route";
import { POST as POST_MAINTENANCE_HANDOVER } from "../../src/app/api/unit-maintenance/handover/route";
import { POST as POST_MAINTENANCE_RECEIVE } from "../../src/app/api/unit-maintenance/receive/route";
import { GET as GET_MAINTENANCE } from "../../src/app/api/unit-maintenance/[handoverId]/route";
import { GET as GET_UNIT_HISTORY } from "../../src/app/api/item-units/[unitId]/history/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";
import { getItemUnits } from "../../src/server/item-units";
import {
  reportUnitDamage,
  updateUnitCondition,
} from "../../src/server/report-unit-damage";
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
  if (!line)
    throw new Error("Expected borrowing line for the damage-report unit");
  const returnBody = returnInput([line.id]);
  const returned = await postReturn(returnBody);
  expect(returned.status).toBe(201);
  return line;
}

function postCheckout(body: unknown = {}) {
  return POST_CHECKOUT(
    new Request(`http://localhost/api/guest-visits/${visitId}/checkout`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ visitId }) },
  );
}

function lossReportInput(borrowingLineId: string) {
  return {
    requestId: randomUUID(),
    guestVisitId: visitId,
    borrowingLineId,
    notes: "Unit tidak ditemukan saat pemeriksaan kamar.",
  };
}

function postLossReport(body: unknown, origin = "http://localhost:3000") {
  return POST_LOSS_REPORT(
    new Request("http://localhost/api/borrowing-loss-reports", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function postLossDecision(reportId: string, body: unknown) {
  return POST_LOSS_DECISION(
    new Request(
      `http://localhost/api/borrowing-loss-reports/${reportId}/decision`,
      {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ reportId }) },
  );
}

function getLossReport(reportId: string) {
  return GET_LOSS_REPORT(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}`),
    { params: Promise.resolve({ reportId }) },
  );
}

function compensationInput() {
  return {
    requestId: randomUUID(),
    amount: "250000.1250",
    currencyCode: "IDR",
    notes: "Kompensasi kehilangan telah dicatat untuk ditinjau Supervisor.",
  };
}

function postCompensation(reportId: string, body: unknown) {
  return POST_COMPENSATION(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/compensations`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reportId }) },
  );
}

function postCompensationDecision(reportId: string, settlementId: string, body: unknown) {
  return POST_COMPENSATION_DECISION(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/compensations/${settlementId}/decision`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reportId, settlementId }) },
  );
}

function replacementInput() {
  return {
    requestId: randomUUID(),
    replacementItemId: itemId,
    name: "Unit pengganti",
    serialNumber: "REPLACEMENT-01",
    receivedAt: new Date().toISOString(),
    receiptConfirmed: true,
    notes: "Barang pengganti telah diterima oleh Housekeeping.",
  };
}

function postReplacement(reportId: string, body: unknown, photos: File[] = files[0]) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  for (const photo of photos) form.append("photo-0", photo);
  return POST_REPLACEMENT(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/replacements`, {
      method: "POST", headers: { Origin: "http://localhost:3000" }, body: form,
    }),
    { params: Promise.resolve({ reportId }) },
  );
}

function postReplacementDecision(reportId: string, settlementId: string, body: unknown) {
  return POST_REPLACEMENT_DECISION(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/replacements/${settlementId}/decision`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reportId, settlementId }) },
  );
}

function getSettlementPhoto(reportId: string, settlementId: string, photoId: string) {
  return GET_SETTLEMENT_PHOTO(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/settlements/${settlementId}/photos/${photoId}`),
    { params: Promise.resolve({ reportId, settlementId, photoId }) },
  );
}

function writeOffInput() {
  return { requestId: randomUUID(), notes: "Diajukan penghapusan kewajiban atas kehilangan yang telah dikonfirmasi." };
}

function postWriteOff(reportId: string, body: unknown) {
  return POST_WRITE_OFF(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/write-offs`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reportId }) },
  );
}

function postWriteOffDecision(reportId: string, settlementId: string, body: unknown) {
  return POST_WRITE_OFF_DECISION(
    new Request(`http://localhost/api/borrowing-loss-reports/${reportId}/write-offs/${settlementId}/decision`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ reportId, settlementId }) },
  );
}

function postLossRecovery(
  reportId: string,
  body: unknown,
  photos: File[] = files[0],
) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  for (const photo of photos) form.append("photo-0", photo);

  return POST_LOSS_RECOVERY(
    new Request(
      `http://localhost/api/borrowing-loss-reports/${reportId}/recovery`,
      { method: "POST", headers: { Origin: "http://localhost:3000" }, body: form },
    ),
    { params: Promise.resolve({ reportId }) },
  );
}

function getLossRecovery(reportId: string) {
  return GET_LOSS_RECOVERY(
    new Request(
      `http://localhost/api/borrowing-loss-reports/${reportId}/recovery`,
    ),
    { params: Promise.resolve({ reportId }) },
  );
}

async function prepareApprovedLossRecovery(
  options: { readiness?: "CLEAR" | "PENDING_INSPECTION"; condition?: "GOOD" | "DAMAGED" } = {},
) {
  const lines = await issueForReturn();
  const line = lines.find((entry) => entry.unitId === unitIds[0]);
  if (!line) throw new Error("Expected borrowing line for loss recovery");
  await db.itemUnit.update({
    where: { id: line.unitId },
    data: {
      condition: options.condition ?? "GOOD",
      readiness: options.readiness ?? "CLEAR",
    },
  });

  const request = lossReportInput(line.id);
  const created = await postLossReport(request);
  expect(created.status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect(
    (
      await postLossDecision(request.requestId, {
        requestId: randomUUID(),
        decision: "APPROVE",
      })
    ).status,
  ).toBe(200);
  mockUser.mockResolvedValue(actor);

  const unit = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  return {
    line,
    reportId: request.requestId,
    body: {
      requestId: randomUUID(),
      expectedUpdatedAt: unit.updatedAt.toISOString(),
      occurredAt: new Date().toISOString(),
      locationId,
      condition: options.condition ?? "GOOD",
      notes: "Unit ditemukan dan diterima kembali oleh Housekeeping.",
    },
  };
}

function getLossReports(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/borrowing-loss-reports");
  url.search = new URLSearchParams(query).toString();
  return GET_LOSS_REPORTS(new Request(url));
}

async function prepareLossList() {
  const lines = await issueForReturn();
  const token = randomUUID();

  await Promise.all(
    lines.map((line, index) =>
      db.itemUnit.update({
        where: { id: line.unitId },
        data: { name: `Unit ${token} ${index}` },
      }),
    ),
  );

  const requests = lines.map((line) => lossReportInput(line.id));
  for (const request of requests) {
    expect((await postLossReport(request)).status).toBe(201);
  }

  await Promise.all(
    requests.map((request, index) =>
      db.borrowingLossReport.update({
        where: { id: request.requestId },
        data: { reportedAt: new Date(`2026-10-28T0${index + 1}:00:00.000Z`) },
      }),
    ),
  );

  return { lines, requests, token };
}

function postDamage(
  body: unknown,
  photos: File[] = [files[0][0]],
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

async function conditionInput(condition = "DAMAGED") {
  const unit = await db.itemUnit.findUniqueOrThrow({ where: { id: unitIds[0] } });
  return {
    ...damageInput(),
    condition,
    expectedUpdatedAt: unit.updatedAt.toISOString(),
  };
}

function postConditionUpdate(
  body: unknown,
  photos: File[] = [files[0][0]],
  origin = "http://localhost:3000",
) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  for (const file of photos) form.append("photo-0", file);

  return POST_CONDITION_UPDATE(new Request("http://localhost/api/item-unit-condition-updates", {
    method: "POST",
    headers: { Origin: origin },
    body: form,
  }));
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

async function maintenanceHandoverInput() {
  const unit = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitIds[0] },
  });
  return {
    requestId: randomUUID(),
    unitId: unit.id,
    expectedUpdatedAt: unit.updatedAt.toISOString(),
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    condition: "DAMAGED" as const,
    handedOverTo: "Tim Engineering",
    notes: "Unit tidak menyala saat diperiksa.",
  };
}

async function maintenanceReceiveInput(handoverId: string) {
  const unit = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitIds[0] },
  });
  return {
    requestId: randomUUID(),
    handoverId,
    expectedUpdatedAt: unit.updatedAt.toISOString(),
    occurredAt: new Date().toISOString(),
    locationId,
    condition: "GOOD" as const,
    receivedFrom: "Tim Engineering",
    performedBy: "Teknisi uji",
    workCompletedAt: new Date(Date.now() - 30_000).toISOString(),
    workPerformed: "Kabel diganti dan fungsi unit diuji.",
  };
}

function postMaintenance(
  operation: "HANDOVER" | "RECEIPT",
  body: unknown,
  photos: File[] = [files[0][0]],
) {
  const form = new FormData();
  form.set("data", JSON.stringify(body));
  for (const file of photos) form.append("photo-0", file);

  const handler =
    operation === "HANDOVER"
      ? POST_MAINTENANCE_HANDOVER
      : POST_MAINTENANCE_RECEIVE;
  const route = operation === "HANDOVER" ? "handover" : "receive";
  return handler(
    new Request(`http://localhost/api/unit-maintenance/${route}`, {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
      body: form,
    }),
  );
}

function getMaintenance(handoverId: string) {
  return GET_MAINTENANCE(
    new Request(`http://localhost/api/unit-maintenance/${handoverId}`),
    { params: Promise.resolve({ handoverId }) },
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
  const url = new URL(
    `http://localhost/api/guest-visits/${targetVisitId}/borrowings`,
  );
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
  const settlementPhotos = await db.borrowingLossSettlementPhoto.findMany({
    where: { settlement: { proposedById: actor.id } },
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
    await tx.borrowingLossSettlementPhoto.deleteMany({
      where: { settlement: { proposedById: actor.id } },
    });
    await tx.borrowingLossSettlement.deleteMany({
      where: { lossReport: { borrowingLine: { borrowing: { issuedById: actor.id } } } },
    });
    await tx.borrowingLossReport.deleteMany({
      where: { borrowingLine: { borrowing: { issuedById: actor.id } } },
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
        OR: [{ id: locationId }, { code: `RETURN-${actor.id}` }],
      },
    });
    await tx.user.delete({ where: { id: actor.id } });
  });

  await Promise.all(
    [...new Set([...photos, ...settlementPhotos].map((photo) => photo.photoKey))]
      .map((key) => unitPhotos.removeUnitPhoto(key)),
  );
  vi.unstubAllEnvs();
});

afterAll(() => db.$disconnect());

it("keeps issued guest snapshots after primary guest and room are corrected", async () => {
  const firstInput = input();
  const firstResponse = await post({ ...firstInput, unitIds: [unitIds[0]] }, [
    files[0],
  ]);
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
  const secondResponse = await post({ ...secondInput, unitIds: [unitIds[1]] }, [
    files[1],
  ]);
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
  const firstIssue = await post({ ...input(), unitIds: [unitIds[0]] }, [
    files[0],
  ]);
  expect(firstIssue.status).toBe(201);
  const first = await firstIssue.json();
  await db.borrowing.update({
    where: { id: first.borrowing.id },
    data: { issuedAt: new Date("2026-10-26T01:00:00.000Z") },
  });
  await db.borrowingLine.updateMany({
    where: { borrowingId: first.borrowing.id },
    data: {
      status: "RETURNED",
      resolvedAt: new Date("2026-10-26T03:00:00.000Z"),
    },
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

  const secondIssue = await post({ ...input(), unitIds: [unitIds[1]] }, [
    files[1],
  ]);
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
    pagination: {
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
      hasNextPage: true,
    },
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
    unit: {
      id: unitIds[0],
      condition: "DAMAGED",
      readiness: "PENDING_INSPECTION",
    },
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
  const originalIssue = await post({ ...input(), unitIds: [unitIds[0]] }, [
    files[0],
  ]);
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
] as const)(
  "rejects invalid borrowing history query input",
  async (query, id: string = visitId) => {
    const response = await getBorrowings(query, id);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  },
);

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

it("allows a Supervisor to hand over and receive a unit", async () => {
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const handover = await maintenanceHandoverInput();
  expect((await postMaintenance("HANDOVER", handover)).status).toBe(201);

  const receive = await maintenanceReceiveInput(handover.requestId);
  expect((await postMaintenance("RECEIPT", receive)).status).toBe(201);
});

it("rolls back a maintenance event and deletes staged photos when evidence persistence fails", async () => {
  const handover = await maintenanceHandoverInput();
  const before = await db.itemUnit.findUniqueOrThrow({
    where: { id: handover.unitId },
  });
  const key = await unitPhotos.storeUnitPhoto(
    await unitPhotos.prepareUnitPhoto(files[0][0]),
  );
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockResolvedValue(key);

  await expect(
    postMaintenance("HANDOVER", handover, [files[0][0], files[1][0]]),
  ).rejects.toThrow();

  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: handover.unitId } }),
  ).toEqual(before);
  expect(await db.auditEvent.count({ where: { id: handover.requestId } })).toBe(
    0,
  );
  await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("preserves committed handover evidence after a lost transaction response", async () => {
  const body = await maintenanceHandoverInput();
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(
    async (callback: unknown) => {
      if (typeof callback !== "function") {
        throw new Error("Expected interactive transaction");
      }

      await transact(
        callback as (tx: Prisma.TransactionClient) => Promise<unknown>,
      );
      throw new Error("Simulated lost handover response");
    },
  );

  await expect(postMaintenance("HANDOVER", body)).rejects.toThrow(
    "Simulated lost handover response",
  );
  const evidence = await db.itemUnitPhoto.findFirstOrThrow({
    where: { auditEventId: body.requestId },
  });
  expect(
    (await unitPhotos.readUnitPhoto(evidence.photoKey)).length,
  ).toBeGreaterThan(0);

  const retry = await postMaintenance("HANDOVER", body);
  expect(retry.status).toBe(200);
  expect(
    await db.itemUnitPhoto.count({ where: { auditEventId: body.requestId } }),
  ).toBe(1);
});

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
        lines: [
          { borrowingLineId: issued[0].id, condition: "GOOD", locationId },
        ],
      },
    });
    expect(firstResult.receipt).not.toHaveProperty("requestHash");

    expect(
      await db.borrowingLine.count({
        where: { id: issued[0].id, status: "RETURNED" },
      }),
    ).toBe(1);
    expect(
      await db.borrowingLine.count({
        where: { id: issued[1].id, status: "OUTSTANDING" },
      }),
    ).toBe(1);
    expect(
      await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } }),
    ).toMatchObject({
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
    expect(
      await db.borrowingLine.count({
        where: { status: "OUTSTANDING", borrowing: { guestVisitId: visitId } },
      }),
    ).toBe(0);
  },
);

it("combines borrowing occasions after checkout, saves per-line location and damage evidence", async () => {
  const firstIssue = await post({ ...input(), unitIds: [unitIds[0]] }, [
    files[0],
  ]);
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
      {
        borrowingLineId: secondLine.id,
        condition: "DAMAGED" as const,
        locationId: override.id,
      },
    ],
  };
  const response = await postReturn(body, [[], [files[1][0], files[0][0]]]);
  expect(response.status).toBe(201);

  const damaged = await db.itemUnit.findUniqueOrThrow({
    where: { id: unitIds[1] },
  });
  expect(damaged).toMatchObject({
    custody: "HOUSEKEEPING",
    condition: "DAMAGED",
    readiness: "PENDING_INSPECTION",
    locationId: override.id,
  });

  const historyResponse = await getBorrowings();
  const history = await historyResponse.json();
  expect(history.summary).toMatchObject({
    totalOccasions: 2,
    returnedLines: 2,
    outstandingLines: 0,
  });
  expect(history.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        returnLine: expect.objectContaining({
          condition: "GOOD",
          location: expect.objectContaining({ id: locationId }),
        }),
      }),
      expect.objectContaining({
        returnLine: expect.objectContaining({
          condition: "DAMAGED",
          location: expect.objectContaining({
            id: override.id,
            code: override.code,
          }),
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
    ]),
  );
  expect(
    await db.itemUnitPhoto.count({
      where: { unitId: unitIds[1], returnLineId: { not: null } },
    }),
  ).toBe(2);
  expect(
    await db.itemUnitPhoto.count({
      where: { unitId: unitIds[1], returnLineId: null },
    }),
  ).toBe(1);
});

it("preserves an existing hold when a returned unit is in good condition", async () => {
  const issued = await issueForReturn();
  await db.itemUnit.update({
    where: { id: issued[0].unitId },
    data: { readiness: "ON_HOLD" },
  });

  const response = await postReturn(returnInput([issued[0].id]));
  expect(response.status).toBe(201);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } }),
  ).toMatchObject({
    custody: "HOUSEKEEPING",
    readiness: "ON_HOLD",
  });
});

it.each(["MINOR_DAMAGE", "DAMAGED", "MISSING_PART"] as const)(
  "rejects %s to GOOD during return and rolls back the whole batch",
  async (condition) => {
    const issued = await issueForReturn();

    await db.itemUnit.update({
      where: { id: issued[1].unitId },
      data: { condition, readiness: "ON_HOLD" },
    });

    const before = await db.itemUnit.findMany({
      where: { id: { in: unitIds } },
      orderBy: { id: "asc" },
    });

    const storedKeys: string[] = [];
    const originalStore = unitPhotos.storeUnitPhoto;
    vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(
      async (prepared) => {
        const key = await originalStore(prepared);
        storedKeys.push(key);
        return key;
      },
    );

    const response = await postReturn(
      returnInput(issued.map((line) => line.id)),
      files,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "UNIT_STATE_CONFLICT",
    });
    expect(
      await db.returnBatch.count({ where: { guestVisitId: visitId } }),
    ).toBe(0);
    expect(
      await db.returnLine.count({
        where: { borrowingLineId: { in: issued.map((line) => line.id) } },
      }),
    ).toBe(0);
    expect(
      await db.borrowingLine.count({
        where: {
          id: { in: issued.map((line) => line.id) },
          status: "OUTSTANDING",
          resolvedAt: null,
        },
      }),
    ).toBe(issued.length);
    expect(
      await db.itemUnit.findMany({
        where: { id: { in: unitIds } },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect(
      await db.auditEvent.count({
        where: {
          entityId: { in: unitIds },
          action: "BORROWING_RETURNED",
        },
      }),
    ).toBe(0);
    expect(
      await db.itemUnitPhoto.count({
        where: {
          unitId: { in: unitIds },
          returnLineId: { not: null },
        },
      }),
    ).toBe(0);

    expect(storedKeys).toHaveLength(2);
    for (const key of storedKeys) {
      await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  },
);

it.each(["MINOR_DAMAGE", "DAMAGED", "MISSING_PART"] as const)(
  "accepts a return retaining the recorded %s condition with evidence",
  async (condition) => {
    const issued = await issueForReturn();
    const line = issued[0];

    await db.itemUnit.update({
      where: { id: line.unitId },
      data: { condition, readiness: "ON_HOLD" },
    });

    const response = await postReturn(
      {
        ...returnInput([line.id]),
        lines: [{ borrowingLineId: line.id, condition }],
      },
      [[files[0][0]]],
    );

    expect(response.status).toBe(201);
    expect(
      await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
    ).toMatchObject({
      condition,
      custody: "HOUSEKEEPING",
      readiness: "PENDING_INSPECTION",
      locationId,
    });
    expect(
      await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
    ).toMatchObject({
      status: "RETURNED",
    });
    expect(
      await db.borrowingLine.findUniqueOrThrow({ where: { id: issued[1].id } }),
    ).toMatchObject({
      status: "OUTSTANDING",
    });
  },
);

it.each(["MINOR_DAMAGE", "MISSING_PART"] as const)(
  "does not reclassify a DAMAGED unit to %s during physical return",
  async (condition) => {
    const issued = await issueForReturn();
    const line = issued[0];
    await db.itemUnit.update({ where: { id: line.unitId }, data: { condition: "DAMAGED", readiness: "ON_HOLD" } });
    const body = { ...returnInput([line.id]), lines: [{ borrowingLineId: line.id, condition }] };
    const response = await postReturn(body, [[files[0][0]]]);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "UNIT_STATE_CONFLICT" });
    expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING" });
    expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toMatchObject({ condition: "DAMAGED", custody: "GUEST" });
    expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(0);
  },
);

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
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(
    0,
  );
  expect(
    await db.borrowingLine.count({
      where: {
        id: { in: issued.map((line) => line.id) },
        status: "OUTSTANDING",
      },
    }),
  ).toBe(2);
});

it("rejects the whole return when any line is not outstanding for this visit", async () => {
  const issued = await issueForReturn();
  const response = await postReturn(returnInput([issued[0].id, randomUUID()]));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "LINES_UNAVAILABLE" });
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(
    0,
  );
  expect(
    await db.itemUnit.count({
      where: { id: { in: unitIds }, custody: "GUEST" },
    }),
  ).toBe(2);
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
    {
      requestId: randomUUID(),
      guestVisitId: otherVisit.id,
      unitIds: [unitIds[1]],
    },
    [files[1]],
  );
  expect(otherIssue.status).toBe(201);
  const [otherLine] = (await otherIssue.json()).borrowing.lines;

  const response = await postReturn(returnInput([otherLine.id]));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "LINES_UNAVAILABLE" });
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: otherLine.id } }),
  ).toMatchObject({ status: "OUTSTANDING" });
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: unitIds[1] } }),
  ).toMatchObject({ custody: "GUEST" });
});

it("rejects inactive and WITH_GUEST receiving locations", async () => {
  const issued = await issueForReturn();
  await db.location.update({
    where: { id: locationId },
    data: { isActive: false },
  });
  const inactive = await postReturn(returnInput([issued[0].id]));
  expect(inactive.status).toBe(409);
  expect(await inactive.json()).toMatchObject({
    error: "LOCATION_UNAVAILABLE",
  });

  const withGuest = await db.location.findUniqueOrThrow({
    where: { code: "WITH_GUEST" },
  });
  const invalidDestination = returnInput([issued[0].id]);
  invalidDestination.defaultLocationId = withGuest.id;
  const rejected = await postReturn(invalidDestination);
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toMatchObject({
    error: "LOCATION_UNAVAILABLE",
  });
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(
    0,
  );
});

it("allows only one concurrent return for the same outstanding units", async () => {
  const issued = await issueForReturn();
  const responses = await Promise.all([
    postReturn(returnInput([issued[0].id])),
    postReturn(returnInput([issued[0].id])),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(
    1,
  );
  expect(
    await db.borrowingLine.count({
      where: { id: issued[0].id, status: "RETURNED" },
    }),
  ).toBe(1);
});

it("replays the same return without overwriting later unit state and rejects request reuse", async () => {
  const issued = await issueForReturn();
  const body = returnInput([issued[0].id]);
  const first = await postReturn(body);
  expect(first.status).toBe(201);
  const saved = await first.json();
  await db.itemUnit.update({
    where: { id: issued[0].unitId },
    data: { condition: "DAMAGED", readiness: "ON_HOLD" },
  });

  const retry = await postReturn(body);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ...saved, replayed: true });
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: issued[0].unitId } }),
  ).toMatchObject({
    condition: "DAMAGED",
    readiness: "ON_HOLD",
  });

  const conflict = await postReturn({
    ...body,
    defaultLocationId: randomUUID(),
  });
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
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(
    0,
  );
  expect(
    await db.borrowingLine.count({
      where: {
        id: { in: issued.map((line) => line.id) },
        status: "OUTSTANDING",
      },
    }),
  ).toBe(2);
  expect(
    await db.itemUnit.count({
      where: { id: { in: unitIds }, custody: "GUEST" },
    }),
  ).toBe(2);
  await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it("preserves return evidence when the transaction committed but its response was lost", async () => {
  const issued = await issueForReturn();
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(
    async (callback: unknown) => {
      if (typeof callback !== "function")
        throw new Error("Expected interactive transaction");
      await transact(
        callback as (tx: Prisma.TransactionClient) => Promise<unknown>,
      );
      throw new Error("Simulated lost transaction response");
    },
  );
  const body = returnInput([issued[0].id]);
  const returnPhoto = [[files[0][0]]];

  await expect(postReturn(body, returnPhoto)).rejects.toThrow(
    "Simulated lost transaction response",
  );
  const savedLine = await db.returnLine.findUniqueOrThrow({
    where: { borrowingLineId: issued[0].id },
    include: { photos: true },
  });
  expect(savedLine.photos).toHaveLength(1);
  expect(
    (await unitPhotos.readUnitPhoto(savedLine.photos[0].photoKey)).length,
  ).toBeGreaterThan(0);

  const retry = await postReturn(body, returnPhoto);
  expect(retry.status).toBe(200);
  expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(
    1,
  );
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
  expect(
    (
      await postReturn(
        returnInput([randomUUID()]),
        [],
        "https://untrusted.example",
      )
    ).status,
  ).toBe(403);
});

it("requires checkout acknowledgement for outstanding units and preserves their obligations", async () => {
  const issued = await issueForReturn();
  const unitsBefore = await db.itemUnit.findMany({
    where: { id: { in: unitIds } },
    orderBy: { id: "asc" },
  });
  const linesBefore = await db.borrowingLine.findMany({
    where: { unitId: { in: unitIds } },
    orderBy: { id: "asc" },
  });
  const warning = await postCheckout();
  expect(warning.status).toBe(409);
  expect(await warning.json()).toMatchObject({
    error: "OUTSTANDING_BORROWINGS",
    outstandingLines: 2,
  });
  expect(
    await db.guestVisit.findUniqueOrThrow({ where: { id: visitId } }),
  ).toMatchObject({
    status: "STAYING",
    checkedOutAt: null,
  });

  const confirmed = await postCheckout({ acknowledgeOutstanding: true });
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toMatchObject({
    visit: { status: "CHECKED_OUT" },
    outstandingLines: 2,
  });
  expect(
    await db.itemUnit.findMany({
      where: { id: { in: unitIds } },
      orderBy: { id: "asc" },
    }),
  ).toEqual(unitsBefore);
  expect(
    await db.borrowingLine.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { id: "asc" },
    }),
  ).toEqual(linesBefore);
  expect(
    await db.auditEvent.findFirstOrThrow({
      where: { entityId: visitId, action: "GUEST_VISIT_CHECKED_OUT" },
    }),
  ).toMatchObject({
    newValues: { outstandingLines: 2, acknowledgedOutstanding: true },
  });
  const rejectedIssue = await post(input());
  expect(rejectedIssue.status).toBe(409);
  expect(await rejectedIssue.json()).toMatchObject({
    error: "VISIT_NOT_STAYING",
  });
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
  const visit = await db.guestVisit.findUniqueOrThrow({
    where: { id: visitId },
  });
  const outstanding = await db.borrowingLine.count({
    where: { borrowing: { guestVisitId: visitId }, status: "OUTSTANDING" },
  });
  expect(visit.status).toBe(issue.status === 201 ? "STAYING" : "CHECKED_OUT");
  expect(outstanding).toBe(issue.status === 201 ? 2 : 0);
});

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "records initial damage for an unborrowed unit as %s with append-only photo history",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    const body = await conditionInput();
    const first = await postConditionUpdate(body, [files[0][0], files[1][0]]);
    expect(first.status).toBe(201);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    const saved = await first.json();
    expect(saved.report).toMatchObject({ id: body.requestId, unitId: body.unitId, reportedBy: { id: actor.id } });
    expect(saved.report.photos).toHaveLength(2);
    expect(await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } })).toMatchObject({
      condition: "DAMAGED", readiness: "ON_HOLD", custody: "HOUSEKEEPING", locationId,
    });
    expect(await db.borrowingLine.count({ where: { unitId: body.unitId } })).toBe(0);
    expect(await db.returnBatch.count({ where: { guestVisitId: visitId } })).toBe(0);

    const next = await conditionInput("DAMAGED");
    expect((await postConditionUpdate(next, [files[0][0]])).status).toBe(201);
    const history = await (await getUnitHistory(body.unitId)).json();
    const event = history.events.find((entry: { id: string }) => entry.id === body.requestId);
    expect(event).toMatchObject({
      action: "ITEM_UNIT_CONDITION_UPDATED",
      oldValues: { condition: "GOOD", readiness: "CLEAR" },
      newValues: { condition: "DAMAGED", readiness: "ON_HOLD" },
    });
    expect(event.newValues).not.toHaveProperty("requestHash");
    expect(event.photos).toHaveLength(2);
    expect(await db.itemUnitPhoto.count({ where: { unitId: body.unitId } })).toBe(3);
  },
);

it.each(["CLEAR", "ON_HOLD", "PENDING_INSPECTION", "PENDING_VERIFICATION"] as const)(
  "appends evidence without clearing or replacing readiness %s",
  async (readiness) => {
    await db.itemUnit.update({ where: { id: unitIds[0] }, data: { readiness } });
    const before = await db.itemUnit.findUniqueOrThrow({ where: { id: unitIds[0] } });
    const body = await conditionInput("GOOD");
    expect((await postConditionUpdate(body, [files[0][0]])).status).toBe(201);
    expect(await db.itemUnit.findUniqueOrThrow({ where: { id: unitIds[0] } })).toEqual({
      ...before, updatedAt: expect.any(Date),
    });
  },
);

it.each(["CONDITION", "DAMAGE"] as const)(
  "rejects new %s observations without photos through the API and service",
  async (operation) => {
    const body =
      operation === "CONDITION"
        ? await conditionInput()
        : damageInput();
    const send =
      operation === "CONDITION" ? postConditionUpdate : postDamage;
    const save =
      operation === "CONDITION" ? updateUnitCondition : reportUnitDamage;
    const before = await db.itemUnit.findUniqueOrThrow({
      where: { id: body.unitId },
    });

    const response = await send(body, []);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: "PHOTOS_REQUIRED",
    });
    await expect(save(body, actor.id, [])).rejects.toMatchObject({
      code: "PHOTOS_REQUIRED",
    });

    expect(
      await db.itemUnit.findUniqueOrThrow({
        where: { id: body.unitId },
      }),
    ).toEqual(before);
    expect(
      await db.auditEvent.count({ where: { id: body.requestId } }),
    ).toBe(0);
    expect(
      await db.itemUnitPhoto.count({
        where: { auditEventId: body.requestId },
      }),
    ).toBe(0);
  },
);

it.each(["CONDITION", "DAMAGE"] as const)(
  "rejects an empty photo for a new %s observation",
  async (operation) => {
    const body =
      operation === "CONDITION"
        ? await conditionInput()
        : damageInput();
    const send =
      operation === "CONDITION" ? postConditionUpdate : postDamage;
    const before = await db.itemUnit.findUniqueOrThrow({
      where: { id: body.unitId },
    });

    const response = await send(body, [
      new File([], "empty.png", { type: "image/png" }),
    ]);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "INVALID_PHOTO" });
    expect(
      await db.itemUnit.findUniqueOrThrow({
        where: { id: body.unitId },
      }),
    ).toEqual(before);
    expect(
      await db.auditEvent.count({ where: { id: body.requestId } }),
    ).toBe(0);
    expect(
      await db.itemUnitPhoto.count({
        where: { auditEventId: body.requestId },
      }),
    ).toBe(0);
  },
);

it.each(["CONDITION", "DAMAGE"] as const)(
  "replays a finalized legacy %s observation without photos or state changes",
  async (operation) => {
    if (operation === "DAMAGE") await prepareDamageReportUnit();

    const body =
      operation === "CONDITION"
        ? await conditionInput()
        : damageInput();
    const send =
      operation === "CONDITION" ? postConditionUpdate : postDamage;
    const action =
      operation === "CONDITION"
        ? "ITEM_UNIT_CONDITION_UPDATED"
        : "ITEM_UNIT_DAMAGE_REPORTED";
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          unitId: body.unitId,
          condition: body.condition,
          notes: body.notes,
          photoHashes: [],
          ...("expectedUpdatedAt" in body
            ? { expectedUpdatedAt: body.expectedUpdatedAt }
            : {}),
        }),
      )
      .digest("hex");

    await db.auditEvent.create({
      data: {
        id: body.requestId,
        actorId: actor.id,
        action,
        entityType: "ITEM_UNIT",
        entityId: body.unitId,
        reason: body.notes,
        oldValues: { condition: "GOOD", readiness: "CLEAR" },
        newValues: {
          condition: body.condition,
          readiness: "ON_HOLD",
          requestHash,
        },
      },
    });
    await db.itemUnit.update({
      where: { id: body.unitId },
      data: { condition: "DAMAGED", readiness: "PENDING_VERIFICATION" },
    });
    const before = await db.itemUnit.findUniqueOrThrow({
      where: { id: body.unitId },
    });

    const response = await send(body, []);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      replayed: true,
      report: { id: body.requestId, unitId: body.unitId, photos: [] },
    });
    expect(
      await db.itemUnit.findUniqueOrThrow({
        where: { id: body.unitId },
      }),
    ).toEqual(before);
    expect(
      await db.auditEvent.count({ where: { id: body.requestId } }),
    ).toBe(1);
    expect(
      await db.itemUnitPhoto.count({
        where: { auditEventId: body.requestId },
      }),
    ).toBe(0);
  },
);

it.each(["GOOD", "MINOR_DAMAGE", "MISSING_PART"] as const)(
  "rejects reclassification from DAMAGED to %s through the general update",
  async (condition) => {
    await db.itemUnit.update({ where: { id: unitIds[0] }, data: { condition: "DAMAGED", readiness: "ON_HOLD" } });
    const body = await conditionInput(condition);
    const response = await postConditionUpdate(body, [files[0][0]]);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "UNIT_STATE_CONFLICT" });
    expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
    expect(await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } })).toMatchObject({ condition: "DAMAGED", readiness: "ON_HOLD" });
  },
);

it("cannot bypass condition reclassification restrictions through the old damage endpoint", async () => {
  await prepareDamageReportUnit();
  expect((await postDamage(damageInput())).status).toBe(201);
  const response = await postDamage({ ...damageInput(), condition: "MINOR_DAMAGE" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "UNIT_STATE_CONFLICT" });
});

it.each([
  { lifecycle: "RETIRED" },
  { custody: "GUEST" },
  { custody: "ENGINEERING" },
  { custody: "EXTERNAL_VENDOR" },
  { lossState: "MISSING" },
  { lossState: "LOST" },
] as const)("rejects condition updates for an ineligible unit: %j", async (patch) => {
  await db.itemUnit.update({ where: { id: unitIds[0] }, data: patch });
  const body = await conditionInput();
  const response = await postConditionUpdate(body);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "UNIT_STATE_CONFLICT" });
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
});

it("rejects outstanding obligations even when a unit appears held by Housekeeping", async () => {
  await issueForReturn();
  await db.itemUnit.update({ where: { id: unitIds[0] }, data: { custody: "HOUSEKEEPING" } });
  const response = await postConditionUpdate(await conditionInput());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "OUTSTANDING_BORROWING" });
});

it("serializes competing condition updates and rejects the stale observation", async () => {
  const first = await conditionInput();
  const second = { ...first, requestId: randomUUID(), condition: "MINOR_DAMAGE" };
  const responses = await Promise.all([postConditionUpdate(first), postConditionUpdate(second)]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const rejected = responses.find((response) => response.status === 409);
  expect(await rejected!.json()).toMatchObject({ error: "STALE_UNIT" });
  expect(await db.auditEvent.count({ where: { entityId: first.unitId, action: "ITEM_UNIT_CONDITION_UPDATED" } })).toBe(1);
});

it("replays condition evidence without overwriting later state or accepting changed bytes", async () => {
  const body = await conditionInput();
  const first = await postConditionUpdate(body, [files[0][0]]);
  expect(first.status).toBe(201);
  const saved = await first.json();
  await db.itemUnit.update({ where: { id: body.unitId }, data: { readiness: "PENDING_VERIFICATION" } });
  const retry = await postConditionUpdate(body, [files[0][0]]);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ...saved, replayed: true });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } })).toMatchObject({ readiness: "PENDING_VERIFICATION" });
  const changed = await postConditionUpdate(body, [files[1][0]]);
  expect(changed.status).toBe(409);
  expect(await changed.json()).toMatchObject({ error: "REQUEST_CONFLICT" });
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(1);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)("denies condition updates by %s", async (role) => {
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postConditionUpdate(await conditionInput())).status).toBe(403);
});

it("saves concurrent retries as one condition observation and one evidence set", async () => {
  const body = await conditionInput();
  const responses = await Promise.all([
    postConditionUpdate(body, [files[0][0]]),
    postConditionUpdate(body, [files[0][0]]),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(1);
  expect(await db.itemUnitPhoto.count({ where: { auditEventId: body.requestId } })).toBe(1);
});

it("rolls back a condition update and cleans its photos when audit persistence fails", async () => {
  const body = await conditionInput();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } });
  const storedKeys: string[] = [];
  const originalStore = unitPhotos.storeUnitPhoto;
  vi.spyOn(unitPhotos, "storeUnitPhoto").mockImplementation(async (prepared) => {
    const key = await originalStore(prepared);
    storedKeys.push(key);
    return key;
  });
  const failure = new Error("Simulated audit failure");
  const originalTransaction = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    originalTransaction(async (tx) => {
      const failingTransaction = new Proxy(tx, {
        get(target, key) {
          if (key === "auditEvent") {
            return new Proxy(target.auditEvent, {
              get(delegate, action) {
                if (action === "create") {
                  return async () => { throw failure; };
                }
                return Reflect.get(delegate, action);
              },
            });
          }
          return Reflect.get(target, key);
        },
      });
      return callback(failingTransaction);
    }, options),
  );
  await expect(postConditionUpdate(body, [files[0][0]])).rejects.toBe(failure);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } })).toEqual(before);
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
  expect(await db.itemUnitPhoto.count({ where: { unitId: body.unitId } })).toBe(0);
  expect(storedKeys).toHaveLength(1);
  await expect(unitPhotos.readUnitPhoto(storedKeys[0])).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps condition evidence after a committed response is lost and safely replays it", async () => {
  const body = await conditionInput();
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Expected interactive transaction");
    await transact(callback as (tx: Prisma.TransactionClient) => Promise<unknown>);
    throw new Error("Simulated lost transaction response");
  });
  await expect(postConditionUpdate(body, [files[0][0]])).rejects.toThrow("Simulated lost transaction response");
  const photo = await db.itemUnitPhoto.findFirstOrThrow({ where: { auditEventId: body.requestId } });
  expect((await unitPhotos.readUnitPhoto(photo.photoKey)).length).toBeGreaterThan(0);
  const retry = await postConditionUpdate(body, [files[0][0]]);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ replayed: true, report: { id: body.requestId } });
  expect(await db.itemUnitPhoto.count({ where: { auditEventId: body.requestId } })).toBe(1);
});

it("validates authentication, origin, unit versions and condition photo bytes", async () => {
  const body = await conditionInput();
  mockUser.mockResolvedValue(null);
  expect((await postConditionUpdate(body)).status).toBe(401);
  mockUser.mockResolvedValue(actor);
  expect((await postConditionUpdate(body, [], "https://untrusted.example")).status).toBe(403);
  expect((await postConditionUpdate({ ...body, expectedUpdatedAt: undefined })).status).toBe(400);
  expect((await postConditionUpdate({ ...body, readiness: "CLEAR" })).status).toBe(400);
  expect((await postConditionUpdate({ ...body, unitId: randomUUID() })).status).toBe(404);
  const badPhoto = await postConditionUpdate(body, [new File(["invalid"], "bad.png", { type: "image/png" })]);
  expect(badPhoto.status).toBe(400);
  expect(await badPhoto.json()).toMatchObject({ error: "INVALID_PHOTO" });
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
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
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(1);
  expect(
    (await postDamage({ ...body, notes: "Payload berbeda." }, [files[0][0]]))
      .status,
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
    200, 201,
  ]);
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(1);
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
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
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

  expect((await postDamage(body, [], "https://untrusted.example")).status).toBe(
    403,
  );
  expect((await postDamage({ ...body, condition: "GOOD" })).status).toBe(400);
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
  expect((await postDamage({ ...body, unitId: randomUUID() })).status).toBe(
    404,
  );

  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } }),
  ).toEqual(before);
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
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

  await expect(postDamage(body, [files[0][0], files[1][0]])).rejects.toThrow();

  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: body.unitId } }),
  ).toEqual(before);
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
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
        callback as (tx: Prisma.TransactionClient) => Promise<unknown>,
      );
      throw new Error("Simulated lost transaction response");
    },
  );

  const body = damageInput();
  await expect(postDamage(body, [files[0][0]])).rejects.toThrow(
    "Simulated lost transaction response",
  );

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
  expect(ready?.units.map((unit) => unit.id)).not.toContain(
    body.units[1].unitId,
  );
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
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(0);
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
    200, 201,
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
    expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(
      0,
    );
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

it("records photo evidence at handover and receipt, then requires Supervisor verification", async () => {
  const handover = await maintenanceHandoverInput();
  const sent = await postMaintenance("HANDOVER", handover, [files[0][0]]);
  expect(sent.status).toBe(201);
  const sentResult = await sent.json();
  expect(sentResult.event.photos).toHaveLength(1);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: handover.unitId } }),
  ).toMatchObject({
    custody: "ENGINEERING",
    condition: "DAMAGED",
    readiness: "ON_HOLD",
    locationId: null,
  });

  const receive = await maintenanceReceiveInput(handover.requestId);
  const received = await postMaintenance("RECEIPT", receive, [files[1][0]]);
  expect(received.status).toBe(201);
  const receivedResult = await received.json();
  expect(receivedResult.event.photos).toHaveLength(1);
  expect(receivedResult.handoverId).toBe(handover.requestId);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: handover.unitId } }),
  ).toMatchObject({
    custody: "HOUSEKEEPING",
    condition: "GOOD",
    readiness: "PENDING_VERIFICATION",
    locationId,
  });
  expect(
    (await getItemUnits(itemId, undefined, true))?.units.map((unit) => unit.id),
  ).not.toContain(handover.unitId);

  const history = await (await getMaintenance(handover.requestId)).json();
  expect(history.before.photos).toHaveLength(1);
  expect(history.after.photos).toHaveLength(1);
  expect(history.before.photos[0].id).not.toBe(history.after.photos[0].id);
  expect(history.before.after).not.toHaveProperty("requestHash");
  expect(history.after.after).not.toHaveProperty("requestHash");

  const unit = await db.itemUnit.findUniqueOrThrow({
    where: { id: handover.unitId },
  });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const verification = await postVerification(
    {
      requestId: randomUUID(),
      units: [
        {
          unitId: unit.id,
          expectedUpdatedAt: unit.updatedAt.toISOString(),
          result: "FIT_FOR_USE",
          notes: "Unit telah diperiksa dan layak digunakan.",
        },
      ],
    },
    [[files[0][0]]],
  );
  expect(verification.status).toBe(201);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: handover.unitId } }),
  ).toMatchObject({ readiness: "CLEAR", condition: "GOOD" });
  expect(
    (await getItemUnits(itemId, undefined, true))?.units.map((entry) => entry.id),
  ).toContain(handover.unitId);
});

it("requires evidence for both maintenance actions and rejects restoring condition without work details", async () => {
  const handover = await maintenanceHandoverInput();
  expect((await postMaintenance("HANDOVER", handover, [])).status).toBe(400);
  expect((await postMaintenance("HANDOVER", handover)).status).toBe(201);

  const receive = await maintenanceReceiveInput(handover.requestId);
  expect((await postMaintenance("RECEIPT", receive, [])).status).toBe(400);
  expect(
    (
      await postMaintenance("RECEIPT", {
        ...receive,
        condition: "DAMAGED",
        performedBy: null,
        workCompletedAt: null,
      })
    ).status,
  ).toBe(201);
});

it("rejects restoring a damaged unit without verified work metadata", async () => {
  const handover = await maintenanceHandoverInput();
  expect((await postMaintenance("HANDOVER", handover)).status).toBe(201);

  const receive = await maintenanceReceiveInput(handover.requestId);
  const response = await postMaintenance("RECEIPT", {
    ...receive,
    performedBy: null,
    workCompletedAt: null,
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "INVALID_WORK_RESULT",
  });
  expect(
    await getMaintenance(handover.requestId).then((result) => result.json()),
  ).toMatchObject({ after: null });
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: handover.unitId } }),
  ).toMatchObject({ custody: "ENGINEERING", condition: "DAMAGED" });
});

it("serializes concurrent receipts and preserves both photo sets on request replay", async () => {
  const handover = await maintenanceHandoverInput();
  expect((await postMaintenance("HANDOVER", handover)).status).toBe(201);
  const receive = await maintenanceReceiveInput(handover.requestId);
  const responses = await Promise.all([
    postMaintenance("RECEIPT", receive, [files[1][0]]),
    postMaintenance("RECEIPT", receive, [files[1][0]]),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);

  const replay = await postMaintenance("RECEIPT", receive, [files[1][0]]);
  expect(replay.status).toBe(200);
  expect(
    await db.itemUnitPhoto.count({
      where: { auditEventId: { in: [handover.requestId, receive.requestId] } },
    }),
  ).toBe(2);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "denies maintenance handover and receipt to %s",
  async (role) => {
    mockUser.mockResolvedValue(actor);
    const handover = await maintenanceHandoverInput();
    expect((await postMaintenance("HANDOVER", handover)).status).toBe(201);
    const receive = await maintenanceReceiveInput(handover.requestId);

    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect(
      (await postMaintenance("HANDOVER", await maintenanceHandoverInput()))
        .status,
    ).toBe(403);
    expect((await postMaintenance("RECEIPT", receive)).status).toBe(403);
  },
);

it("records a guest loss report with notes and keeps the borrowing unresolved", async () => {
  const [line] = await issueForReturn();
  const reportInput = lossReportInput(line.id);
  const response = await postLossReport(reportInput);
  expect(response.status).toBe(201);
  const { report } = await response.json();
  expect(report).toMatchObject({
    id: reportInput.requestId,
    status: "PENDING",
    notes: reportInput.notes,
    borrowingLine: { id: line.id, status: "OUTSTANDING", resolvedAt: null },
  });
  expect(report).not.toHaveProperty("requestHash");
  const replay = await postLossReport(reportInput);
  expect(replay.status).toBe(200);
  const borrowingHistory = await getBorrowings().then((result) => result.json());
  expect(
    borrowingHistory.lines.find(
      (entry: { id: string }) => entry.id === line.id,
    ).lossReports,
  ).toMatchObject([{ id: report.id, status: "PENDING" }]);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({ custody: "GUEST", lossState: "NONE" });

  const duplicate = await postLossReport({
    ...lossReportInput(line.id),
    requestId: randomUUID(),
  });
  expect(duplicate.status).toBe(409);
  expect(
    await db.borrowingLossReport.count({
      where: { borrowingLine: { borrowing: { guestVisitId: visitId } } },
    }),
  ).toBe(1);
});

it("allows a supervisor to confirm a loss without resolving the guest obligation", async () => {
  const [line] = await issueForReturn();
  const created = await postLossReport(lossReportInput(line.id));
  const { report } = await created.json();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  const decision = {
    requestId: randomUUID(),
    decision: "APPROVE",
    notes: "Kehilangan telah dikonfirmasi.",
  };
  const response = await postLossDecision(report.id, decision);
  expect(response.status).toBe(200);
  expect((await response.json()).report.status).toBe("APPROVED");
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({ custody: "GUEST", lossState: "LOST", readiness: "ON_HOLD" });
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "OUTSTANDING", resolvedAt: null });

  const retry = await postLossDecision(report.id, decision);
  expect(retry.status).toBe(200);
  expect(await db.auditEvent.count({ where: { id: decision.requestId } })).toBe(1);
  expect(await getLossReport(report.id).then((result) => result.json())).toMatchObject({
    report: { status: "APPROVED", closedBy: { id: actor.id } },
  });
});

it("allows a supervisor to reject a loss report without changing unit state", async () => {
  const [line] = await issueForReturn();
  const created = await postLossReport(lossReportInput(line.id));
  const { report } = await created.json();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });

  const decision = { requestId: randomUUID(), decision: "REJECT" };
  const response = await postLossDecision(report.id, decision);
  expect(response.status).toBe(200);
  expect((await response.json()).report.status).toBe("REJECTED");
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({ custody: "GUEST", lossState: "NONE", readiness: "CLEAR" });
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "OUTSTANDING", resolvedAt: null });
  expect((await postLossReport(lossReportInput(line.id))).status).toBe(201);
});

it("cancels a pending loss report atomically when the unit is returned", async () => {
  const [line, otherLine] = await issueForReturn();
  const created = await Promise.all([
    postLossReport(lossReportInput(line.id)),
    postLossReport(lossReportInput(otherLine.id)),
  ]);
  expect(created.map((response) => response.status)).toEqual([201, 201]);
  const [{ report }, { report: otherReport }] = await Promise.all(
    created.map((response) => response.json()),
  );

  const returnBody = returnInput([line.id]);
  const returned = await postReturn(returnBody);
  expect(returned.status).toBe(201);
  expect(
    await db.borrowingLossReport.findUniqueOrThrow({ where: { id: report.id } }),
  ).toMatchObject({
    status: "CANCELLED",
    closedById: actor.id,
    closureNotes: "Unit diterima melalui pengembalian.",
  });
  expect(
    await db.borrowingLossReport.findUniqueOrThrow({
      where: { id: otherReport.id },
    }),
  ).toMatchObject({ status: "PENDING", closedAt: null, closedById: null });
  expect(
    await db.auditEvent.count({
      where: {
        action: "BORROWING_LOSS_CANCELLED",
        entityId: line.unitId,
      },
    }),
  ).toBe(1);

  const replay = await postReturn(returnBody);
  expect(replay.status).toBe(200);
  expect(
    await db.auditEvent.count({
      where: {
        action: "BORROWING_LOSS_CANCELLED",
        entityId: line.unitId,
      },
    }),
  ).toBe(1);
});

it("does not allow a new loss report after the borrowing line was returned", async () => {
  const [line] = await issueForReturn();
  expect((await postReturn(returnInput([line.id]))).status).toBe(201);

  const response = await postLossReport(lossReportInput(line.id));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "LINE_NOT_OUTSTANDING" });
  expect(
    await db.borrowingLossReport.count({
      where: { borrowingLine: { borrowing: { guestVisitId: visitId } } },
    }),
  ).toBe(0);
});

it("serializes loss reporting with physical return", async () => {
  const [line] = await issueForReturn();
  const reportInput = lossReportInput(line.id);
  const returnBody = returnInput([line.id]);
  const [reportResponse, returnResponse] = await Promise.all([
    postLossReport(reportInput),
    postReturn(returnBody),
  ]);

  expect(returnResponse.status).toBe(201);
  expect([201, 409]).toContain(reportResponse.status);
  const savedReport = await db.borrowingLossReport.findFirst({
    where: { borrowingLineId: line.id },
  });
  if (savedReport) expect(savedReport.status).toBe("CANCELLED");
  else expect(reportResponse.status).toBe(409);
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "RETURNED" });
});

it("keeps a pending loss report when the return transaction rolls back", async () => {
  const [line] = await issueForReturn();
  const created = await postLossReport(lossReportInput(line.id));
  const { report } = await created.json();
  const returnBody = returnInput([line.id]);
  const failure = new Error("Simulated return audit failure");
  const originalTransaction = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    originalTransaction(
      async (tx) => {
        const failingTransaction = new Proxy(tx, {
          get(target, key) {
            if (key === "auditEvent") {
              return new Proxy(target.auditEvent, {
                get(delegate, action) {
                  if (action === "create") {
                    return async (
                      args: Parameters<typeof target.auditEvent.create>[0],
                    ) => {
                      if (args.data.action === "RETURN_CREATED") throw failure;
                      return target.auditEvent.create(args);
                    };
                  }
                  return Reflect.get(delegate, action);
                },
              });
            }
            return Reflect.get(target, key);
          },
        });
        return callback(failingTransaction);
      },
      options,
    ),
  );

  await expect(postReturn(returnBody)).rejects.toBe(failure);
  expect(
    await db.borrowingLossReport.findUniqueOrThrow({ where: { id: report.id } }),
  ).toMatchObject({ status: "PENDING", closedAt: null, closedById: null });
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "OUTSTANDING", resolvedAt: null });
  expect(
    await db.returnBatch.count({ where: { guestVisitId: visitId } }),
  ).toBe(0);
  expect(
    await db.auditEvent.count({ where: { action: "BORROWING_LOSS_CANCELLED" } }),
  ).toBe(0);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "does not allow %s to report a borrowed unit as lost",
  async (role) => {
    const [line] = await issueForReturn();
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await postLossReport(lossReportInput(line.id))).status).toBe(403);
    expect(
      await db.borrowingLossReport.count({
        where: { borrowingLine: { borrowing: { guestVisitId: visitId } } },
      }),
    ).toBe(0);
  },
);

it("allows a loss report after guest checkout while its borrowing remains outstanding", async () => {
  const [line] = await issueForReturn();
  expect((await postCheckout({ acknowledgeOutstanding: true })).status).toBe(200);

  const response = await postLossReport(lossReportInput(line.id));
  expect(response.status).toBe(201);
  expect((await response.json()).report.status).toBe("PENDING");
});

it("paginates loss reports with unit details without exposing request hashes", async () => {
  const { requests, token } = await prepareLossList();

  const firstPage = await getLossReports({ q: token, pageSize: "1" });
  expect(firstPage.status).toBe(200);
  expect(firstPage.headers.get("Cache-Control")).toBe("no-store");
  const first = await firstPage.json();
  expect(first.lossReports.map((report: { id: string }) => report.id)).toEqual([
    requests[1].requestId,
  ]);
  expect(first.lossReports[0]).not.toHaveProperty("requestHash");
  expect(first.lossReports[0].borrowingLine.unit).toMatchObject({
    name: `Unit ${token} 1`,
    item: { id: itemId },
  });
  expect(first.lossReports[0].borrowingLine.unit.unitCode).toMatch(
    /^HK-\d{6,}$/u,
  );
  expect(first.pagination).toMatchObject({
    page: 1,
    pageSize: 1,
    total: 2,
    totalPages: 2,
    hasNextPage: true,
  });

  const secondPage = await getLossReports({
    q: token,
    page: "2",
    pageSize: "1",
  });
  expect((await secondPage.json()).lossReports[0].id).toBe(
    requests[0].requestId,
  );

  const emptyPage = await getLossReports({
    q: token,
    page: "3",
    pageSize: "1",
  });
  expect(await emptyPage.json()).toMatchObject({
    lossReports: [],
    pagination: { total: 2, hasNextPage: false },
  });
});

it("defaults to pending loss reports and supports explicit status filters", async () => {
  const { requests, token } = await prepareLossList();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const decision = { requestId: randomUUID(), decision: "REJECT" };
  expect(
    (await postLossDecision(requests[0].requestId, decision)).status,
  ).toBe(200);

  const pending = await getLossReports({ q: token });
  expect(await pending.json()).toMatchObject({
    lossReports: [{ id: requests[1].requestId, status: "PENDING" }],
    pagination: { total: 1 },
  });

  const rejected = await getLossReports({ q: token, status: "REJECTED" });
  expect(await rejected.json()).toMatchObject({
    lossReports: [{ id: requests[0].requestId, status: "REJECTED" }],
    pagination: { total: 1 },
  });

  const all = await getLossReports({ q: token, status: "ALL" });
  expect((await all.json()).pagination.total).toBe(2);
});

it("treats wildcard characters in loss report search as literal text", async () => {
  const { lines, requests, token } = await prepareLossList();
  await Promise.all([
    db.itemUnit.update({
      where: { id: lines[0].unitId },
      data: { name: `Unit ${token}%_` },
    }),
    db.itemUnit.update({
      where: { id: lines[1].unitId },
      data: { name: `Unit ${token}ab` },
    }),
  ]);

  const response = await getLossReports({ q: `unit ${token}%_` });
  expect(await response.json()).toMatchObject({
    lossReports: [{ id: requests[0].requestId }],
    pagination: { total: 1 },
  });
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)(
  "allows %s to view loss reports",
  async (role) => {
    mockUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await getLossReports()).status).toBe(200);
  },
);

it("denies system administrators and unauthenticated users access to loss reports", async () => {
  mockUser.mockResolvedValue({ ...actor, roles: ["SYSTEM_ADMIN"] });
  expect((await getLossReports()).status).toBe(403);

  mockUser.mockResolvedValue(null);
  expect((await getLossReports()).status).toBe(401);
});

it.each([
  { page: "0" },
  { page: "1.5" },
  { page: "1001" },
  { pageSize: "0" },
  { pageSize: "51" },
  { status: "LOST" },
  { q: "x".repeat(101) },
] as Record<string, string>[])(
  "rejects invalid loss report query input: %o",
  async (query) => {
    expect((await getLossReports(query)).status).toBe(400);
  },
);

it("physically recovers an approved lost borrowing without recording a return", async () => {
  const { line, reportId, body } = await prepareApprovedLossRecovery();

  const response = await postLossRecovery(reportId, body);
  expect(response.status).toBe(201);
  const { recovery } = await response.json();
  expect(recovery).toMatchObject({
    id: body.requestId,
    unitId: line.unitId,
    after: {
      custody: "HOUSEKEEPING",
      locationId,
      condition: "GOOD",
      readiness: "CLEAR",
      lossState: "NONE",
      borrowingStatus: "SETTLED",
      resolutionMethod: "PHYSICAL_RECOVERY",
      occurredAt: body.occurredAt,
    },
  });
  expect(recovery).not.toHaveProperty("after.requestHash");
  expect(recovery.photos).toHaveLength(1);
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({
    status: "SETTLED",
    resolutionMethod: "PHYSICAL_RECOVERY",
    resolvedAt: new Date(body.occurredAt),
  });
  expect(
    await db.returnLine.count({ where: { borrowingLineId: line.id } }),
  ).toBe(0);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({
    custody: "HOUSEKEEPING",
    locationId,
    condition: "GOOD",
    readiness: "CLEAR",
    lossState: "NONE",
  });

  const history = await getBorrowings({ status: "ALL" }).then((result) =>
    result.json(),
  );
  const savedLine = history.lines.find((entry: { id: string }) => entry.id === line.id);
  expect(savedLine).toMatchObject({ status: "SETTLED", resolutionMethod: "PHYSICAL_RECOVERY" });
  expect(savedLine.photos).toHaveLength(1);
  expect(
    await db.itemUnitPhoto.count({
      where: { borrowingLineId: line.id, auditEventId: body.requestId },
    }),
  ).toBe(1);

  const details = await getLossRecovery(reportId);
  expect(details.status).toBe(200);
  expect(await details.json()).toMatchObject({
    report: { id: reportId, status: "APPROVED" },
    recovery: { id: body.requestId, photos: [{ id: recovery.photos[0].id }] },
  });
  const unitHistory = await getUnitHistory(line.unitId).then((result) =>
    result.json(),
  );
  const recoveryEvent = unitHistory.events.find(
    (event: { id: string }) => event.id === body.requestId,
  );
  expect(recoveryEvent).toBeDefined();
  expect(recoveryEvent.newValues).not.toHaveProperty("requestHash");
});

it.each([
  { amount: "0" },
  { amount: "0.0000" },
  { amount: "-1" },
  { amount: "1.12345" },
  { amount: "1000000000000000" },
  { amount: 100 },
  { currencyCode: "US" },
  { currencyCode: "US12" },
] as Record<string, unknown>[])("rejects invalid compensation input: %o", async (invalid) => {
  const { reportId } = await prepareApprovedLossRecovery();
  const response = await postCompensation(reportId, { ...compensationInput(), ...invalid });
  expect(response.status).toBe(400);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(0);
});

it.each(["250000", "12.3456", "999999999999999.9999"])(
  "preserves the exact compensation amount %s without floating-point conversion",
  async (amount) => {
    const { reportId, line } = await prepareApprovedLossRecovery();
    const unit = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
    const response = await postCompensation(reportId, { ...compensationInput(), amount, currencyCode: "usd" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ settlement: { amount, currencyCode: "USD", status: "PENDING" } });
    expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(unit);
    expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolvedAt: null });
    const history = await getLossReport(reportId).then((result) => result.json());
    expect(history.report.settlements).toMatchObject([{ amount, currencyCode: "USD" }]);
    expect(history.report.settlements[0]).not.toHaveProperty("requestHash");
  },
);

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)("denies %s compensation proposals", async (role) => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postCompensation(reportId, compensationInput())).status).toBe(403);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(0);
});

it.each(["HK_STAFF", "MANAGEMENT", "SYSTEM_ADMIN"] as const)("denies %s compensation decisions", async (role) => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(403);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING" });
});

it("rejects compensation before loss approval and after physical recovery", async () => {
  const [line] = await issueForReturn();
  const report = lossReportInput(line.id);
  expect((await postLossReport(report)).status).toBe(201);
  expect((await postCompensation(report.requestId, compensationInput())).status).toBe(409);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postLossDecision(report.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(200);
  const unit = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  mockUser.mockResolvedValue(actor);
  expect((await postLossRecovery(report.requestId, {
    requestId: randomUUID(), expectedUpdatedAt: unit.updatedAt.toISOString(),
    occurredAt: new Date().toISOString(), locationId, condition: "GOOD", notes: "Ditemukan kembali.",
  })).status).toBe(201);
  expect((await postCompensation(report.requestId, compensationInput())).status).toBe(409);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: report.requestId } })).toBe(0);
});

it("rejects a second pending proposal without changing the unit or borrowing", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  expect((await postCompensation(reportId, compensationInput())).status).toBe(409);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolutionMethod: null });
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(1);
});

it("approves compensation for exactly one borrowing line while preserving the lost unit", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const unitsBefore = await db.itemUnit.count({ where: { itemId } });
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const response = await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE", notes: "Kompensasi disetujui." });
  expect(response.status).toBe(200);
  const { settlement } = await response.json();
  expect(settlement).toMatchObject({ status: "APPROVED", amount: "250000.125", currencyCode: "IDR", decidedBy: { id: actor.id } });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "SETTLED", resolutionMethod: "COMPENSATION", resolvedAt: new Date(settlement.decidedAt) });
  expect(await db.borrowingLine.count({ where: { borrowingId: (await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).borrowingId, status: "OUTSTANDING" } })).toBe(1);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.itemUnit.count({ where: { itemId } })).toBe(unitsBefore);
  expect(await db.returnLine.count({ where: { borrowingLineId: line.id } })).toBe(0);
  expect((await postCompensation(reportId, compensationInput())).status).toBe(409);
  const history = await getBorrowings({ status: "ALL" }).then((result) => result.json());
  expect(history.lines.find((entry: { id: string }) => entry.id === line.id)).toMatchObject({ resolutionMethod: "COMPENSATION", lossReports: [{ settlements: [{ status: "APPROVED" }] }] });
});

it("rejects compensation without resolving the line and permits a new proposal", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "REJECT", notes: "Nominal perlu dikoreksi." })).status).toBe(200);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolvedAt: null, resolutionMethod: null });
  expect((await postCompensation(reportId, compensationInput())).status).toBe(201);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(2);
});

it("replays compensation requests and decisions without duplicating audits or rewinding later state", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  expect((await postCompensation(reportId, proposal)).status).toBe(200);
  expect((await postCompensation(reportId, { ...proposal, amount: "1" })).status).toBe(409);
  expect((await postCompensation(reportId, { ...proposal, currencyCode: "USD" })).status).toBe(409);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const decision = { requestId: randomUUID(), decision: "APPROVE", notes: "Disetujui." };
  expect((await postCompensationDecision(reportId, proposal.requestId, decision)).status).toBe(200);
  const settled = await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } });
  const replay = await postCompensationDecision(reportId, proposal.requestId, decision);
  expect(await replay.json()).toMatchObject({ replayed: true, settlement: { status: "APPROVED" } });
  expect((await postCompensationDecision(reportId, proposal.requestId, { ...decision, decision: "REJECT" })).status).toBe(409);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toEqual(settled);
  expect(await db.auditEvent.count({ where: { id: { in: [proposal.requestId, decision.requestId] } } })).toBe(2);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(1);
  const history = await getUnitHistory(line.unitId).then((result) => result.json());
  for (const event of history.events.filter((entry: { action: string }) => entry.action.startsWith("BORROWING_COMPENSATION_"))) {
    expect(event.newValues).not.toHaveProperty("requestHash");
  }
});

it("serializes concurrent compensation proposals and decisions", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposals = [compensationInput(), compensationInput()];
  const responses = await Promise.all(proposals.map((body) => postCompensation(reportId, body)));
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const proposal = await db.borrowingLossSettlement.findFirstOrThrow({ where: { lossReportId: reportId } });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const decisions = await Promise.all(["APPROVE", "REJECT"].map((decision) => postCompensationDecision(reportId, proposal.id, { requestId: randomUUID(), decision })));
  expect(decisions.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await db.auditEvent.count({ where: { action: { in: ["BORROWING_COMPENSATION_APPROVED", "BORROWING_COMPENSATION_REJECTED"] }, newValues: { path: ["settlementId"], equals: proposal.id } } })).toBe(1);
});

it("rolls back compensation approval and its borrowing resolution when audit persistence fails", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  const unitBefore = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const failure = new Error("Simulated compensation audit failure");
  const originalTransaction = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    originalTransaction(async (tx) => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "auditEvent") return new Proxy(target.auditEvent, {
          get(delegate, action) {
            if (action === "create") return async (args: Parameters<typeof target.auditEvent.create>[0]) => {
              if (args.data.action === "BORROWING_COMPENSATION_APPROVED") throw failure;
              return target.auditEvent.create(args);
            };
            return Reflect.get(delegate, action);
          },
        });
        return Reflect.get(target, key);
      },
    })), options),
  );
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const decision = { requestId: randomUUID(), decision: "APPROVE" };
  await expect(postCompensationDecision(reportId, proposal.requestId, decision)).rejects.toBe(failure);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING", decidedAt: null, decidedById: null });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolutionMethod: null, resolvedAt: null });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(unitBefore);
  expect(await db.auditEvent.count({ where: { id: decision.requestId } })).toBe(0);
});

it("rejects approving a pending compensation after physical recovery", async () => {
  const { reportId, body } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  expect((await postLossRecovery(reportId, body)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(409);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING" });
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "REJECT", notes: "Unit telah ditemukan dan diterima." })).status).toBe(200);
});

it("does not expose compensation mutations to unauthenticated requests or mismatched reports", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue(null);
  expect((await postCompensation(reportId, compensationInput())).status).toBe(401);
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(401);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postCompensationDecision(randomUUID(), proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(404);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING" });
});

it("serializes physical recovery with compensation approval without replacing a finalized resolution", async () => {
  const { reportId, line, body } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const [decision, recovery] = await Promise.all([
    postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" }),
    postLossRecovery(reportId, body),
  ]);
  expect(recovery.status).toBe(201);
  expect([200, 409]).toContain(decision.status);
  const settlement = await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } });
  const savedLine = await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } });
  expect(savedLine.status).toBe("SETTLED");
  if (decision.status === 200) {
    expect(settlement.status).toBe("APPROVED");
    expect(savedLine.resolutionMethod).toBe("COMPENSATION");
    expect(savedLine.resolvedAt).toEqual(settlement.decidedAt);
  } else {
    expect(settlement.status).toBe("PENDING");
    expect(savedLine.resolutionMethod).toBe("PHYSICAL_RECOVERY");
    expect(savedLine.resolvedAt).toEqual(new Date(body.occurredAt));
  }
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toMatchObject({ custody: "HOUSEKEEPING", lossState: "NONE" });
  expect(await db.returnLine.count({ where: { borrowingLineId: line.id } })).toBe(0);
});

it("receives a later-found unit without undoing its approved compensation", async () => {
  const { reportId, line, body } = await prepareApprovedLossRecovery();
  const proposal = compensationInput();
  expect((await postCompensation(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(200);
  const settled = await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } });
  mockUser.mockResolvedValue(actor);
  const response = await postLossRecovery(reportId, { ...body, occurredAt: new Date().toISOString() });
  expect(response.status).toBe(201);
  expect((await response.json()).recovery.after).toMatchObject({ resolutionMethod: "COMPENSATION", custody: "HOUSEKEEPING", lossState: "NONE" });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toEqual(settled);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "APPROVED" });
});

it("preserves an earlier readiness hold when a recovered unit is in good condition", async () => {
  const { line, reportId, body } = await prepareApprovedLossRecovery({
    readiness: "PENDING_INSPECTION",
  });

  expect((await postLossRecovery(reportId, body)).status).toBe(201);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({
    custody: "HOUSEKEEPING",
    readiness: "PENDING_INSPECTION",
    lossState: "NONE",
  });
});

it("holds a recovered unit for inspection when its received condition is not good", async () => {
  const { line, reportId, body } = await prepareApprovedLossRecovery();

  const response = await postLossRecovery(reportId, {
    ...body,
    condition: "DAMAGED",
  });
  expect(response.status).toBe(201);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({
    custody: "HOUSEKEEPING",
    condition: "DAMAGED",
    readiness: "PENDING_INSPECTION",
    lossState: "NONE",
  });
});

it("does not let physical recovery clear a previously recorded damaged condition", async () => {
  const { line, reportId, body } = await prepareApprovedLossRecovery({
    condition: "DAMAGED",
  });

  const response = await postLossRecovery(reportId, { ...body, condition: "GOOD" });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "CONDITION_CONFLICT" });
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "OUTSTANDING", resolutionMethod: null });
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({ custody: "GUEST", condition: "DAMAGED", lossState: "LOST" });
  expect(
    await db.auditEvent.count({ where: { id: body.requestId } }),
  ).toBe(0);
});

it("requires receipt photos and replays the same physical recovery without changing later state", async () => {
  const { line, reportId, body } = await prepareApprovedLossRecovery();
  const missingPhoto = await postLossRecovery(reportId, body, []);
  expect(missingPhoto.status).toBe(400);
  expect(await missingPhoto.json()).toMatchObject({ error: "PHOTOS_REQUIRED" });
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "OUTSTANDING" });

  const first = await postLossRecovery(reportId, body);
  expect(first.status).toBe(201);
  await db.itemUnit.update({
    where: { id: line.unitId },
    data: { readiness: "PENDING_VERIFICATION" },
  });
  const replay = await postLossRecovery(reportId, body);
  expect(replay.status).toBe(200);
  expect(
    await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } }),
  ).toMatchObject({ custody: "HOUSEKEEPING", readiness: "PENDING_VERIFICATION" });
  expect(await db.auditEvent.count({ where: { id: body.requestId } })).toBe(1);
  expect(await db.itemUnitPhoto.count({ where: { auditEventId: body.requestId } })).toBe(1);
});

it("settles a guest-loss report only once when recovery requests race", async () => {
  const { line, reportId, body } = await prepareApprovedLossRecovery();
  const requests = [
    postLossRecovery(reportId, body),
    postLossRecovery(reportId, { ...body, requestId: randomUUID() }),
  ];
  const responses = await Promise.all(requests);

  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(
    await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } }),
  ).toMatchObject({ status: "SETTLED", resolutionMethod: "PHYSICAL_RECOVERY" });
  expect(
    await db.auditEvent.count({
      where: { action: "BORROWING_PHYSICALLY_RECOVERED", entityId: line.unitId },
    }),
  ).toBe(1);
  expect(await db.itemUnitPhoto.count({ where: { borrowingLineId: line.id } })).toBe(2);
});

it("keeps a physically received replacement pending without creating inventory", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const proposal = replacementInput();
  const response = await postReplacement(reportId, proposal, [files[0][0], files[1][0]]);
  expect(response.status).toBe(201);
  const { settlement } = await response.json();
  expect(settlement).toMatchObject({
    id: proposal.requestId, method: "REPLACEMENT", status: "PENDING", amount: null,
    currencyCode: null, replacementItemId: itemId, replacementCondition: "GOOD",
    replacementUnitId: null, receivedAt: proposal.receivedAt,
  });
  expect(settlement.photos).toHaveLength(2);
  expect(settlement).not.toHaveProperty("requestHash");
  expect(settlement.photos[0]).not.toHaveProperty("photoKey");
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolvedAt: null });
  const report = await getLossReport(reportId).then((result) => result.json());
  expect(report.report.settlements[0].photos[0].url).toBe(settlement.photos[0].url);
  const photo = await getSettlementPhoto(reportId, settlement.id, settlement.photos[0].id);
  expect(photo.status).toBe(200);
  expect(photo.headers.get("Cache-Control")).toBe("private, no-store");
  expect(photo.headers.get("Content-Type")).toBe("image/webp");
  expect((await photo.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await getSettlementPhoto(randomUUID(), settlement.id, settlement.photos[0].id)).status).toBe(404);
  mockUser.mockResolvedValue({ ...actor, roles: ["SYSTEM_ADMIN"] });
  expect((await getSettlementPhoto(reportId, settlement.id, settlement.photos[0].id)).status).toBe(403);
});

it("approves a replacement under a different registered item type and creates exactly one unit", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const itemName = `Replacement ${randomUUID()}`;
  const replacementItem = await db.item.create({ data: { name: itemName, normalizedName: itemName.toLowerCase(), createdById: actor.id, updatedById: actor.id } });
  const proposal = { ...replacementInput(), replacementItemId: replacementItem.id };
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  const original = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const decision = { requestId: randomUUID(), decision: "APPROVE", notes: "Barang pengganti diterima." };
  const response = await postReplacementDecision(reportId, proposal.requestId, decision);
  expect(response.status).toBe(200);
  const { settlement } = await response.json();
  const storage = await db.location.findUniqueOrThrow({ where: { code: "HK_MAIN_STORAGE" } });
  expect(settlement).toMatchObject({ method: "REPLACEMENT", status: "APPROVED", replacementUnit: { itemId: replacementItem.id, condition: "GOOD", readiness: "CLEAR", custody: "HOUSEKEEPING", locationId: storage.id } });
  const newUnit = await db.itemUnit.findUniqueOrThrow({ where: { id: settlement.replacementUnitId } });
  expect(newUnit.id).not.toBe(line.unitId);
  expect(newUnit.unitNumber).not.toBe(original.unitNumber);
  expect(newUnit).toMatchObject({ name: proposal.name, serialNumber: proposal.serialNumber, itemId: replacementItem.id });
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(3);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(original);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "SETTLED", resolutionMethod: "REPLACEMENT", resolvedAt: new Date(settlement.decidedAt) });
  expect(await db.borrowingLine.count({ where: { borrowing: { guestVisitId: visitId }, status: "OUTSTANDING" } })).toBe(1);
  expect(await db.returnLine.count({ where: { borrowingLineId: line.id } })).toBe(0);
  const evidence = await db.itemUnitPhoto.findMany({ where: { unitId: newUnit.id }, include: { auditEvent: true } });
  expect(evidence).toHaveLength(1);
  expect(evidence[0].auditEvent).toMatchObject({ action: "STOCK_UNIT_CREATED", newValues: { settlementId: proposal.requestId, originalUnitId: line.unitId, borrowingLineId: line.id } });
  expect(await unitPhotos.readUnitPhoto(evidence[0].photoKey)).toBeInstanceOf(Buffer);
  expect((await postReplacementDecision(reportId, proposal.requestId, decision)).status).toBe(200);
  expect((await postReplacementDecision(reportId, proposal.requestId, { ...decision, requestId: randomUUID() })).status).toBe(409);
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(3);
  expect(await db.auditEvent.count({ where: { id: decision.requestId } })).toBe(1);
});

it.each(["MINOR_DAMAGE", "DAMAGED", "MISSING_PART"] as const)("accepts a %s replacement pending inspection without treating approval as verification", async (condition) => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = { ...replacementInput(), condition };
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const response = await postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" });
  expect(response.status).toBe(200);
  expect((await response.json()).settlement.replacementUnit).toMatchObject({ condition, readiness: "PENDING_INSPECTION" });
});

it("rejects a replacement without creating a unit and permits a fresh settlement proposal", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "REJECT" })).status).toBe(200);
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolutionMethod: null });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toMatchObject({ lossState: "LOST" });
  expect(await db.borrowingLossSettlementPhoto.count({ where: { settlementId: proposal.requestId } })).toBe(1);
  expect((await postCompensation(reportId, compensationInput())).status).toBe(201);
});

it.each([
  { receiptConfirmed: false },
  { receivedAt: "not-a-date" },
  { condition: "LOST" },
  { replacementItemId: "invalid" },
  { amount: "1" },
] as Record<string, unknown>[])("rejects invalid replacement input: %o", async (invalid) => {
  const { reportId } = await prepareApprovedLossRecovery();
  expect((await postReplacement(reportId, { ...replacementInput(), ...invalid })).status).toBe(400);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(0);
});

it("requires new replacement photos and validates item availability and receipt time", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal, [])).status).toBe(400);
  expect((await postReplacement(reportId, { ...proposal, receivedAt: new Date(Date.now() + 60_000).toISOString() })).status).toBe(400);
  await db.item.update({ where: { id: itemId }, data: { isActive: false } });
  expect((await postReplacement(reportId, proposal)).status).toBe(409);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(0);
});

it("keeps one pending settlement across compensation and replacement methods", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const responses = await Promise.all([
    postReplacement(reportId, replacementInput()),
    postCompensation(reportId, compensationInput()),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId, status: "PENDING" } })).toBe(1);
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)("denies %s replacement proposals", async (role) => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postReplacement(reportId, replacementInput())).status).toBe(403);
});

it.each(["HK_STAFF", "MANAGEMENT", "SYSTEM_ADMIN"] as const)("denies %s replacement decisions", async (role) => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(403);
});

it("replays replacement proposals with immutable photos and rejects changed evidence or wrong decision endpoints", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  expect((await postReplacement(reportId, proposal)).status).toBe(200);
  expect((await postReplacement(reportId, proposal, files[1])).status).toBe(409);
  expect((await postReplacement(reportId, { ...proposal, serialNumber: "OTHER" })).status).toBe(409);
  expect(await db.borrowingLossSettlementPhoto.count({ where: { settlementId: proposal.requestId } })).toBe(1);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(404);
});

it("rechecks a replacement item before approval without creating partial inventory", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  await db.item.update({ where: { id: itemId }, data: { isActive: false } });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(409);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING", replacementUnitId: null });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING" });
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
});

it("serializes replacement approvals and rolls back new inventory when the decision audit fails", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  const failure = new Error("Simulated replacement audit failure");
  const originalTransaction = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    originalTransaction(async (tx) => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "auditEvent") return new Proxy(target.auditEvent, {
          get(delegate, action) {
            if (action === "create") return async (args: Parameters<typeof target.auditEvent.create>[0]) => {
              if (args.data.action === "BORROWING_REPLACEMENT_APPROVED") throw failure;
              return target.auditEvent.create(args);
            };
            return Reflect.get(delegate, action);
          },
        });
        return Reflect.get(target, key);
      },
    })), options),
  );
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  await expect(postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).rejects.toBe(failure);
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING" });
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING", replacementUnitId: null });
  expect(await db.borrowingLossSettlementPhoto.count({ where: { settlementId: proposal.requestId } })).toBe(1);
  const responses = await Promise.all([0, 1].map(() => postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })));
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(3);
});

it("receives the original unit after replacement without undoing settlement or removing the new unit", async () => {
  const { reportId, line, body } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  expect((await postReplacement(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const decision = await postReplacementDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" });
  expect(decision.status).toBe(200);
  const { settlement } = await decision.json();
  const originalLine = await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } });
  mockUser.mockResolvedValue(actor);
  expect((await postLossRecovery(reportId, body)).status).toBe(201);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toEqual(originalLine);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toMatchObject({ custody: "HOUSEKEEPING", lossState: "NONE" });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: settlement.replacementUnitId } })).toMatchObject({ custody: "HOUSEKEEPING", lossState: "NONE" });
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(3);
});

it("retains replacement photos after a committed response is lost and replays without creating another proposal", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Expected interactive transaction");
    await transact(callback as (tx: Prisma.TransactionClient) => Promise<unknown>);
    throw new Error("Simulated lost replacement response");
  });
  await expect(postReplacement(reportId, proposal)).rejects.toThrow("Simulated lost replacement response");
  const photo = await db.borrowingLossSettlementPhoto.findFirstOrThrow({ where: { settlementId: proposal.requestId } });
  expect((await unitPhotos.readUnitPhoto(photo.photoKey)).length).toBeGreaterThan(0);
  const replay = await postReplacement(reportId, proposal);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({ replayed: true, settlement: { id: proposal.requestId, status: "PENDING" } });
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(1);
  expect(await db.borrowingLossSettlementPhoto.count({ where: { settlementId: proposal.requestId } })).toBe(1);
});

it("rolls back replacement receipt records and removes staged photos when its audit fails", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = replacementInput();
  const stored = vi.spyOn(unitPhotos, "storeUnitPhoto");
  const failure = new Error("Simulated replacement receipt audit failure");
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    transact(async (tx) => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "auditEvent") return new Proxy(target.auditEvent, {
          get(delegate, action) {
            if (action === "create") return async () => { throw failure; };
            return Reflect.get(delegate, action);
          },
        });
        return Reflect.get(target, key);
      },
    })), options),
  );
  await expect(postReplacement(reportId, proposal)).rejects.toBe(failure);
  expect(await db.borrowingLossSettlement.count({ where: { id: proposal.requestId } })).toBe(0);
  expect(await db.borrowingLossSettlementPhoto.count({ where: { settlementId: proposal.requestId } })).toBe(0);
  expect(await db.auditEvent.count({ where: { id: proposal.requestId } })).toBe(0);
  const key = await stored.mock.results[0].value;
  await expect(unitPhotos.readUnitPhoto(key)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses replacement proposals before loss approval or after its borrowing is resolved", async () => {
  const [line] = await issueForReturn();
  const report = lossReportInput(line.id);
  expect((await postLossReport(report)).status).toBe(201);
  expect((await postReplacement(report.requestId, replacementInput())).status).toBe(409);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postLossDecision(report.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(200);
  const unit = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const receipt = {
    requestId: randomUUID(), expectedUpdatedAt: unit.updatedAt.toISOString(),
    occurredAt: new Date().toISOString(), locationId, condition: "GOOD", notes: "Unit ditemukan.",
  };
  expect((await postLossRecovery(report.requestId, receipt)).status).toBe(201);
  expect((await postReplacement(report.requestId, replacementInput())).status).toBe(409);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: report.requestId } })).toBe(0);
});

it("records a supervisor write-off proposal without changing inventory or the guest obligation", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  const response = await postWriteOff(reportId, proposal);
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ settlement: {
    id: proposal.requestId, method: "WRITE_OFF", status: "PENDING",
    amount: null, currencyCode: null, replacementUnitId: null, notes: proposal.notes,
  } });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolvedAt: null, resolutionMethod: null });
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
  expect(await db.borrowingLossSettlementPhoto.count({ where: { settlementId: proposal.requestId } })).toBe(0);
});

it.each(["HK_STAFF", "MANAGEMENT", "SYSTEM_ADMIN"] as const)("denies %s write-off proposals", async (role) => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postWriteOff(reportId, writeOffInput())).status).toBe(403);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(0);
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "SYSTEM_ADMIN"] as const)("denies %s write-off decisions", async (role) => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: [role] });
  expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE", notes: "Disetujui." })).status).toBe(403);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING", decidedAt: null });
});

it("allows Management to approve exactly one obligation after checkout while preserving the lost unit", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  expect((await postCheckout({ acknowledgeOutstanding: true })).status).toBe(200);
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  const decision = { requestId: randomUUID(), decision: "APPROVE", notes: "Penghapusan kewajiban disetujui berdasarkan hasil peninjauan." };
  const response = await postWriteOffDecision(reportId, proposal.requestId, decision);
  expect(response.status).toBe(200);
  const { settlement } = await response.json();
  expect(settlement).toMatchObject({ status: "APPROVED", method: "WRITE_OFF", decisionNotes: decision.notes, decidedBy: { id: actor.id } });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "SETTLED", resolutionMethod: "WRITE_OFF", resolvedAt: new Date(settlement.decidedAt) });
  expect(await db.borrowingLine.count({ where: { borrowing: { guestVisitId: visitId }, status: "OUTSTANDING" } })).toBe(1);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
  expect(await db.returnLine.count({ where: { borrowingLineId: line.id } })).toBe(0);
  expect(await db.auditEvent.findUniqueOrThrow({ where: { id: decision.requestId } })).toMatchObject({ reason: decision.notes, action: "BORROWING_WRITE_OFF_APPROVED" });
  const history = await getBorrowings({ status: "ALL" }).then((result) => result.json());
  expect(history.lines.find((entry: { id: string }) => entry.id === line.id)).toMatchObject({ resolutionMethod: "WRITE_OFF", lossReports: [{ settlements: [{ method: "WRITE_OFF", status: "APPROVED" }] }] });
});

it("keeps a rejected write-off in history and permits another settlement proposal", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  const before = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "REJECT", notes: "Dasar pengajuan belum memadai." })).status).toBe(200);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(before);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolvedAt: null });
  mockUser.mockResolvedValue(actor);
  expect((await postCompensation(reportId, compensationInput())).status).toBe(201);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(2);
});

it.each([{}, { notes: " " }, { amount: "1", notes: "Alasan." }])("requires a write-off reason and rejects unrelated proposal fields: %o", async (invalid) => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postWriteOff(reportId, { requestId: randomUUID(), ...invalid })).status).toBe(400);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(0);
});

it.each(["APPROVE", "REJECT"] as const)("requires a Management reason for %s", async (decision) => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  for (const notes of [undefined, "   "]) {
    expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision, notes })).status).toBe(400);
  }
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING", decidedAt: null });
});

it("replays write-off requests and decisions without duplicating or altering finalized records", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  expect((await postWriteOff(reportId, proposal)).status).toBe(200);
  expect((await postWriteOff(reportId, { ...proposal, notes: "Alasan berubah." })).status).toBe(409);
  expect((await postCompensation(reportId, { ...compensationInput(), requestId: proposal.requestId })).status).toBe(409);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  const decision = { requestId: randomUUID(), decision: "APPROVE", notes: "Disetujui setelah peninjauan." };
  expect((await postWriteOffDecision(reportId, proposal.requestId, decision)).status).toBe(200);
  const settled = await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } });
  const replay = await postWriteOffDecision(reportId, proposal.requestId, decision);
  expect(await replay.json()).toMatchObject({ replayed: true });
  expect((await postWriteOffDecision(reportId, proposal.requestId, { ...decision, decision: "REJECT" })).status).toBe(409);
  expect((await postWriteOffDecision(reportId, proposal.requestId, { ...decision, requestId: randomUUID() })).status).toBe(409);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toEqual(settled);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(1);
  expect(await db.auditEvent.count({ where: { id: { in: [proposal.requestId, decision.requestId] } } })).toBe(2);
  const history = await getUnitHistory(line.unitId).then((result) => result.json());
  const event = history.events.find((entry: { id: string }) => entry.id === decision.requestId);
  expect(event.newValues).not.toHaveProperty("requestHash");
});

it("keeps one pending settlement across all three methods", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const responses = await Promise.all([
    postWriteOff(reportId, writeOffInput()),
    postReplacement(reportId, replacementInput()),
    postCompensation(reportId, compensationInput()),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409]);
  expect(await db.borrowingLossSettlement.count({ where: { lossReportId: reportId } })).toBe(1);
});

it.each(["COMPENSATION", "REPLACEMENT"] as const)("does not let Management decide %s through the write-off endpoint", async (method) => {
  const { reportId } = await prepareApprovedLossRecovery();
  const proposal = method === "COMPENSATION" ? compensationInput() : replacementInput();
  const response = method === "COMPENSATION"
    ? await postCompensation(reportId, proposal)
    : await postReplacement(reportId, proposal);
  expect(response.status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE", notes: "Ditinjau." })).status).toBe(404);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING" });
});

it("blocks unauthenticated write-off requests and prevents Supervisor approval through compensation routes", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue(null);
  expect((await postWriteOff(reportId, writeOffInput())).status).toBe(401);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  expect((await postCompensationDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(404);
  mockUser.mockResolvedValue(null);
  expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE", notes: "Ditinjau." })).status).toBe(401);
});

it("does not approve a pending write-off after physical recovery resolves the obligation", async () => {
  const { reportId, body } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  expect((await postLossRecovery(reportId, body)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE", notes: "Ditinjau." })).status).toBe(409);
  expect((await postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision: "REJECT", notes: "Unit telah ditemukan dan diterima." })).status).toBe(200);
});

it("rolls back a write-off decision and line resolution when its audit fails", async () => {
  const { reportId, line } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  const unitBefore = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  const failure = new Error("Simulated write-off audit failure");
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    transact(async (tx) => callback(new Proxy(tx, {
      get(target, key) {
        if (key === "auditEvent") return new Proxy(target.auditEvent, {
          get(delegate, action) {
            if (action === "create") return async () => { throw failure; };
            return Reflect.get(delegate, action);
          },
        });
        return Reflect.get(target, key);
      },
    })), options),
  );
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  const decision = { requestId: randomUUID(), decision: "APPROVE", notes: "Disetujui." };
  await expect(postWriteOffDecision(reportId, proposal.requestId, decision)).rejects.toBe(failure);
  expect(await db.borrowingLossSettlement.findUniqueOrThrow({ where: { id: proposal.requestId } })).toMatchObject({ status: "PENDING", decidedAt: null, decidedById: null });
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ status: "OUTSTANDING", resolutionMethod: null });
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toEqual(unitBefore);
  expect(await db.auditEvent.count({ where: { id: decision.requestId } })).toBe(0);
});

it("serializes Management write-off decisions", async () => {
  const { reportId } = await prepareApprovedLossRecovery();
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  const proposal = writeOffInput();
  expect((await postWriteOff(reportId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  const responses = await Promise.all(["APPROVE", "REJECT"].map((decision) => postWriteOffDecision(reportId, proposal.requestId, { requestId: randomUUID(), decision, notes: "Hasil peninjauan Management." })));
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await db.auditEvent.count({ where: { action: { in: ["BORROWING_WRITE_OFF_APPROVED", "BORROWING_WRITE_OFF_REJECTED"] }, newValues: { path: ["settlementId"], equals: proposal.requestId } } })).toBe(1);
});

it("refuses an unapproved loss report and preserves an approved write-off during later recovery", async () => {
  const [line] = await issueForReturn();
  const report = lossReportInput(line.id);
  expect((await postLossReport(report)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postWriteOff(report.requestId, writeOffInput())).status).toBe(409);
  expect((await postLossDecision(report.requestId, { requestId: randomUUID(), decision: "APPROVE" })).status).toBe(200);
  const proposal = writeOffInput();
  expect((await postWriteOff(report.requestId, proposal)).status).toBe(201);
  mockUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  expect((await postWriteOffDecision(report.requestId, proposal.requestId, { requestId: randomUUID(), decision: "APPROVE", notes: "Penghapusan disetujui." })).status).toBe(200);
  const settled = await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } });
  const unit = await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } });
  mockUser.mockResolvedValue(actor);
  expect((await postLossRecovery(report.requestId, {
    requestId: randomUUID(), expectedUpdatedAt: unit.updatedAt.toISOString(),
    occurredAt: new Date().toISOString(), locationId, condition: "GOOD", notes: "Unit asli ditemukan dan diterima.",
  })).status).toBe(201);
  expect(await db.borrowingLine.findUniqueOrThrow({ where: { id: line.id } })).toEqual(settled);
  expect(await db.itemUnit.findUniqueOrThrow({ where: { id: line.unitId } })).toMatchObject({ custody: "HOUSEKEEPING", lossState: "NONE" });
  expect(await db.itemUnit.count({ where: { createdById: actor.id } })).toBe(2);
  mockUser.mockResolvedValue({ ...actor, roles: ["HK_SUPERVISOR"] });
  expect((await postWriteOff(report.requestId, writeOffInput())).status).toBe(409);
});
