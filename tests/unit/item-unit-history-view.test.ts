import { expect, it } from "vitest";

import {
  historyChanges,
  historyEventDetails,
  historyEventTitle,
  parseUnitHistory,
} from "../../src/lib/item-unit-history-view";

const unitId = "unit-1";
const unitCode = "HK-000001";

it("preserves event photo references scoped to this unit", () => {
  const body = historyBody();
  const photo = { id: "photo-1", url: `/api/item-units/${unitId}/photos/photo-1` };
  const withPhotos = { ...body, events: [{ ...body.events[0], photos: [photo] }] };
  expect(parseUnitHistory(withPhotos, unitId, unitCode, 1)?.events[0].photos).toEqual([photo]);
  for (const url of ["https://example.test/photo", "/api/item-units/other/photos/photo-1", "javascript:alert(1)"]) {
    expect(parseUnitHistory({ ...body, events: [{ ...body.events[0], photos: [{ ...photo, url }] }] }, unitId, unitCode, 1)).toBeNull();
  }
  expect(parseUnitHistory({ ...body, events: [{ ...body.events[0], photos: [photo, photo] }] }, unitId, unitCode, 1)).toBeNull();
});

function historyBody() {
  return {
    unit: { id: unitId, unitCode },
    events: [
      {
        id: "event-1",
        action: "ITEM_UNIT_DETAILS_UPDATED",
        reason: null,
        oldValues: {
          serialNumber: "OLD",
          notes: "Catatan lama.",
        },
        newValues: {
          serialNumber: "NEW",
          notes: null,
        },
        createdAt: "2026-10-23T04:00:00.000Z",
        actor: { id: "actor-1", name: "Operator" },
      },
    ],
    pagination: {
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    },
  };
}

it.each([
  { before: null, after: "Unit A" },
  { before: "Unit A", after: "Unit B" },
  { before: "Unit A", after: null },
])("shows the real audited name change %j", ({ before, after }) => {
  const event = historyBody().events[0];
  expect(historyChanges({ ...event, oldValues: { name: before }, newValues: { name: after } })).toEqual([
    { key: "name", label: "Nama unit", before, after },
  ]);
});

it("shows a registration name without inventing names for legacy records", () => {
  const event = historyBody().events[0];
  expect(historyChanges({ ...event, action: "STOCK_UNIT_CREATED", oldValues: null, newValues: { name: "Unit A" } })).toEqual([
    { key: "name", label: "Nama unit", before: null, after: "Unit A" },
  ]);
  expect(historyChanges({ ...event, oldValues: {}, newValues: { name: "Unit A" } })).toEqual([]);
  expect(historyChanges({ ...event, oldValues: { name: "Unit A" }, newValues: { name: "Unit A" } })).toEqual([]);
});

it("accepts history for the requested unit and page", () => {
  expect(
    parseUnitHistory(historyBody(), unitId, unitCode, 1),
  ).not.toBeNull();
});

it("rejects a different unit, asset code or page", () => {
  expect(
    parseUnitHistory(historyBody(), "another-unit", unitCode, 1),
  ).toBeNull();

  expect(
    parseUnitHistory(historyBody(), unitId, "HK-999999", 1),
  ).toBeNull();

  expect(
    parseUnitHistory(historyBody(), unitId, unitCode, 2),
  ).toBeNull();
});

it("rejects malformed dates and inconsistent pagination", () => {
  const invalidDate = historyBody();
  invalidDate.events[0].createdAt = "invalid";

  expect(
    parseUnitHistory(invalidDate, unitId, unitCode, 1),
  ).toBeNull();

  const invalidPagination = historyBody();
  invalidPagination.pagination.hasNextPage = true;

  expect(
    parseUnitHistory(invalidPagination, unitId, unitCode, 1),
  ).toBeNull();
});

it("accepts a genuinely empty history", () => {
  const body = {
    unit: { id: unitId, unitCode },
    events: [],
    pagination: {
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    },
  };

  expect(
    parseUnitHistory(body, unitId, unitCode, 1)?.events,
  ).toEqual([]);
});

it("shows audited changes including cleared descriptions", () => {
  const data = parseUnitHistory(
    historyBody(),
    unitId,
    unitCode,
    1,
  );

  expect(data).not.toBeNull();
  if (!data) throw new Error("Invalid fixture");

  expect(historyChanges(data.events[0])).toEqual([
    {
      key: "serialNumber",
      label: "Nomor seri",
      before: "OLD",
      after: "NEW",
    },
    {
      key: "notes",
      label: "Deskripsi",
      before: "Catatan lama.",
      after: null,
    },
  ]);

  expect(
    historyChanges({
      ...data.events[0],
      newValues: data.events[0].oldValues,
    }),
  ).toEqual([]);
});

it("does not invent changes for unknown actions or malformed values", () => {
  const data = parseUnitHistory(
    historyBody(),
    unitId,
    unitCode,
    1,
  );

  if (!data) throw new Error("Invalid fixture");

  expect(
    historyChanges({
      ...data.events[0],
      action: "FUTURE_ACTION",
    }),
  ).toEqual([]);

  expect(
    historyChanges({
      ...data.events[0],
      oldValues: [],
      newValues: { serialNumber: 123 },
    }),
  ).toEqual([]);

  expect(historyEventTitle("STOCK_UNIT_CREATED"))
    .toBe("Unit ditambahkan");

  expect(historyEventTitle("FUTURE_ACTION"))
    .toBe("Aktivitas unit");
});

it.each([
  ["BORROWING_ISSUED", "Unit dipinjamkan"],
  ["BORROWING_RETURNED", "Unit dikembalikan"],
  ["ITEM_UNIT_DAMAGE_REPORTED", "Kerusakan dilaporkan"],
  ["ITEM_UNIT_VERIFIED", "Unit diverifikasi"],
])("labels %s history", (action, title) => {
  expect(historyEventTitle(action)).toBe(title);
});

it("shows issue snapshots and a safe borrowing-history link without internal IDs", () => {
  const event = {
    ...historyBody().events[0],
    action: "BORROWING_ISSUED",
    oldValues: { custody: "HOUSEKEEPING", locationId: "location-id" },
    newValues: {
      custody: "GUEST",
      locationId: "destination-id",
      conditionAtIssue: "GOOD",
      guestVisitId: "c26f706a-d579-48f0-84d8-7aa67442bda0",
      primaryGuestNameSnapshot: "Ayu Guest",
      roomNumberSnapshot: "201",
      borrowingId: "borrowing-id",
    },
  };

  expect(historyEventDetails(event)).toEqual({
    facts: [
      { key: "primaryGuestNameSnapshot", label: "Tamu", value: "Ayu Guest" },
      { key: "roomNumberSnapshot", label: "Kamar", value: "201" },
      { key: "conditionAtIssue", label: "Kondisi saat dipinjamkan", value: "Baik" },
    ],
    visitHref: "/guests/c26f706a-d579-48f0-84d8-7aa67442bda0?status=ALL#riwayat-peminjaman",
    photoLabel: "Foto peminjaman",
  });
  expect(historyChanges(event)).toEqual([
    { key: "custody", label: "Pemegang unit", before: "Housekeeping", after: "Tamu" },
  ]);
});

it("shows the return snapshot, received time, condition and return photos", () => {
  const event = {
    ...historyBody().events[0],
    action: "BORROWING_RETURNED",
    oldValues: { condition: "GOOD", readiness: "CLEAR", custody: "GUEST" },
    newValues: {
      condition: "MINOR_DAMAGE",
      readiness: "ON_HOLD",
      custody: "HOUSEKEEPING",
      guestVisitId: "c26f706a-d579-48f0-84d8-7aa67442bda0",
      primaryGuestNameSnapshot: "Ayu Guest",
      roomNumberSnapshot: "201",
      receivedAt: "2026-10-23T04:30:00.000Z",
    },
  };

  const details = historyEventDetails(event);
  expect(details).toMatchObject({
    facts: [
      { key: "primaryGuestNameSnapshot", label: "Tamu", value: "Ayu Guest" },
      { key: "roomNumberSnapshot", label: "Kamar", value: "201" },
      { key: "condition", label: "Kondisi saat dikembalikan", value: "Rusak ringan" },
      { key: "readiness", label: "Kesiapan setelah kejadian", value: "Belum siap" },
      { key: "receivedAt", label: "Diterima kembali" },
    ],
    visitHref: "/guests/c26f706a-d579-48f0-84d8-7aa67442bda0?status=ALL#riwayat-peminjaman",
    photoLabel: "Foto pengembalian",
  });
  const receivedAt = details.facts.find((fact) => fact.key === "receivedAt");
  expect(receivedAt?.value).toMatch(/11[.:]30 WIB/u);
});

it("shows damage and verification state transitions without changing physical condition on FIT", () => {
  const base = historyBody().events[0];
  const damage = {
    ...base,
    action: "ITEM_UNIT_DAMAGE_REPORTED",
    oldValues: { condition: "GOOD", readiness: "CLEAR" },
    newValues: { condition: "DAMAGED", readiness: "ON_HOLD", requestHash: "internal" },
  };
  expect(historyEventDetails(damage)).toMatchObject({
    facts: [
      { key: "condition", label: "Kondisi tercatat", value: "Rusak" },
      { key: "readiness", label: "Kesiapan setelah kejadian", value: "Belum siap" },
    ],
    visitHref: null,
    photoLabel: "Foto laporan kerusakan",
  });
  expect(historyChanges(damage)).toEqual([
    { key: "condition", label: "Kondisi", before: "Baik", after: "Rusak" },
    { key: "readiness", label: "Kesiapan", before: "Siap", after: "Belum siap" },
  ]);

  const verification = {
    ...base,
    action: "ITEM_UNIT_VERIFIED",
    oldValues: { condition: "MINOR_DAMAGE", readiness: "PENDING_VERIFICATION" },
    newValues: {
      result: "FIT_FOR_USE",
      condition: "MINOR_DAMAGE",
      readiness: "CLEAR",
    },
  };
  expect(historyEventDetails(verification)).toMatchObject({
    facts: [
      { key: "result", label: "Hasil verifikasi", value: "Layak digunakan" },
      { key: "condition", label: "Kondisi tercatat", value: "Rusak ringan" },
      { key: "readiness", label: "Kesiapan setelah kejadian", value: "Siap" },
    ],
    photoLabel: "Foto verifikasi",
  });
  expect(historyChanges(verification)).toEqual([
    {
      key: "readiness",
      label: "Kesiapan",
      before: "Menunggu verifikasi",
      after: "Siap",
    },
  ]);
});

it("shows Engineering handover and receipt as separate maintenance history events", () => {
  const base = historyBody().events[0];
  const handover = {
    ...base,
    action: "ITEM_UNIT_SENT_TO_ENGINEERING",
    oldValues: {
      condition: "DAMAGED",
      readiness: "ON_HOLD",
      custody: "HOUSEKEEPING",
    },
    newValues: {
      condition: "DAMAGED",
      readiness: "ON_HOLD",
      custody: "ENGINEERING",
      handedOverTo: "Petugas Engineering",
      occurredAt: "2026-10-28T02:00:00.000Z",
    },
  };

  expect(historyEventTitle(handover.action)).toBe("Unit diserahkan ke Engineering");
  expect(historyEventDetails(handover)).toMatchObject({
    facts: [
      { key: "handedOverTo", label: "Penerima di Engineering" },
      { key: "condition", label: "Kondisi tercatat", value: "Rusak" },
      { key: "readiness", label: "Kesiapan setelah kejadian", value: "Belum siap" },
      { key: "occurredAt", label: "Waktu penyerahan" },
    ],
    visitHref: null,
    photoLabel: "Foto bukti kerusakan",
  });
  expect(historyChanges(handover)).toEqual([
    { key: "custody", label: "Pemegang unit", before: "Housekeeping", after: "Engineering" },
  ]);

  const receipt = {
    ...base,
    action: "ITEM_UNIT_RECEIVED_FROM_ENGINEERING",
    oldValues: {
      condition: "DAMAGED",
      readiness: "ON_HOLD",
      custody: "ENGINEERING",
    },
    newValues: {
      condition: "GOOD",
      readiness: "PENDING_VERIFICATION",
      custody: "HOUSEKEEPING",
      receivedFrom: "Petugas Housekeeping",
      performedBy: "Teknisi",
      occurredAt: "2026-10-28T04:00:00.000Z",
      workCompletedAt: "2026-10-28T03:45:00.000Z",
    },
  };

  expect(historyEventTitle(receipt.action)).toBe("Unit diterima dari Engineering");
  expect(historyEventDetails(receipt)).toMatchObject({
    facts: [
      { key: "receivedFrom", label: "Diserahkan oleh" },
      { key: "performedBy", label: "Pelaksana perbaikan" },
      { key: "condition", label: "Kondisi tercatat", value: "Baik" },
      { key: "readiness", label: "Kesiapan setelah kejadian", value: "Menunggu verifikasi" },
      { key: "occurredAt", label: "Waktu penerimaan" },
      { key: "workCompletedAt", label: "Pekerjaan selesai" },
    ],
    visitHref: null,
    photoLabel: "Foto penerimaan unit",
  });
  expect(historyChanges(receipt)).toEqual([
    { key: "condition", label: "Kondisi", before: "Rusak", after: "Baik" },
    { key: "readiness", label: "Kesiapan", before: "Belum siap", after: "Menunggu verifikasi" },
    { key: "custody", label: "Pemegang unit", before: "Engineering", after: "Housekeeping" },
  ]);
});

it("does not render malformed guest links or unrecognized audited values", () => {
  const event = {
    ...historyBody().events[0],
    action: "BORROWING_RETURNED",
    oldValues: { condition: "GOOD", readiness: "CLEAR", custody: "GUEST" },
    newValues: {
      condition: "UNKNOWN_CONDITION",
      readiness: "UNKNOWN_READINESS",
      custody: "HOUSEKEEPING",
      guestVisitId: "javascript:alert(1)",
      primaryGuestNameSnapshot: "Ayu Guest",
      receivedAt: "not-a-date",
      locationId: "private-id",
    },
  };
  expect(historyEventDetails(event)).toEqual({
    facts: [{ key: "primaryGuestNameSnapshot", label: "Tamu", value: "Ayu Guest" }],
    visitHref: null,
    photoLabel: "Foto pengembalian",
  });
  expect(historyChanges(event)).toEqual([
    { key: "custody", label: "Pemegang unit", before: "Tamu", after: "Housekeeping" },
  ]);
  expect(historyEventDetails({ ...event, action: "FUTURE_ACTION" })).toEqual({
    facts: [],
    visitHref: null,
    photoLabel: "Foto aktivitas",
  });
});
