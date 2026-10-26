import { expect, it } from "vitest";

import {
  historyChanges,
  historyEventTitle,
  parseUnitHistory,
} from "../../src/lib/item-unit-history-view";

const unitId = "unit-1";
const unitCode = "HK-000001";

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
