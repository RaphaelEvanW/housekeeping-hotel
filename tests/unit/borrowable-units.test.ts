import { expect, it } from "vitest";
import { parseBorrowableUnits } from "../../src/lib/borrowable-units";

const itemId = "22222222-2222-4222-8222-222222222222";
const unit = { id: "33333333-3333-4333-8333-333333333333", unitNumber: 4, unitCode: "HK-000004", name: null, serialNumber: "ABC", condition: "GOOD", location: { name: "Gudang" } };
const result = { item: { id: itemId, name: "Buku", isActive: true }, units: [unit], nextCursor: 4 };

it("accepts a current cursor page and rejects another item's result or a looping cursor", () => {
  expect(parseBorrowableUnits(result, itemId, 2)?.units[0].serialNumber).toBe("ABC");
  expect(parseBorrowableUnits(result, unit.id, 2)).toBeNull();
  expect(parseBorrowableUnits(result, itemId, 4)).toBeNull();
  expect(parseBorrowableUnits({ ...result, nextCursor: 3 }, itemId, 2)).toBeNull();
  expect(parseBorrowableUnits({ ...result, units: [unit, unit] }, itemId, 2)).toBeNull();
});
