import { expect, it } from "vitest";

import { updateItemUnitInputSchema } from "../../src/server/item-unit-input";
import { addStockInputSchema } from "../../src/server/add-stock-input";

it("accepts a name-only correction and normalizes whitespace", () => {
  expect(updateItemUnitInputSchema.parse({ name: "  Hair   dryer  01 " })).toEqual({ name: "Hair dryer 01" });
});

it.each(["", "   ", null])("clears a name with %j", name => {
  expect(updateItemUnitInputSchema.parse({ name })).toEqual({ name: null });
});

it.each([123, false, {}, "x".repeat(101)])("rejects an invalid name %j in both operations", name => {
  expect(updateItemUnitInputSchema.safeParse({ name }).success).toBe(false);
  expect(addStockInputSchema.safeParse({
    requestId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0",
    itemId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0", quantity: 1, units: [{ name }],
  }).success).toBe(false);
});

it("accepts repeated optional names and preserves omitted names in batch input", () => {
  const batch = addStockInputSchema.parse({
    requestId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0",
    itemId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0", quantity: 4,
    units: [{ name: " Unit   A " }, { name: "Unit A" }, { name: null }, {}],
  });
  expect(batch.units).toEqual([
    { name: "Unit A", condition: "GOOD" }, { name: "Unit A", condition: "GOOD" },
    { name: null, condition: "GOOD" }, { condition: "GOOD" },
  ]);
});

it("trims serial number and notes", () => {
  const result = updateItemUnitInputSchema.parse({
    serialNumber: "  SERIAL-001  ",
    notes: "  Label diperbaiki.  ",
  });

  expect(result).toEqual({
    serialNumber: "SERIAL-001",
    notes: "Label diperbaiki.",
  });
});

it("accepts a serial-number-only correction", () => {
  const result = updateItemUnitInputSchema.parse({
    serialNumber: "SERIAL-002",
  });

  expect(result).toEqual({
    serialNumber: "SERIAL-002",
  });
});

it("accepts a notes-only correction", () => {
  const result = updateItemUnitInputSchema.parse({
    notes: "Nomor seri tidak terbaca.",
  });

  expect(result).toEqual({
    notes: "Nomor seri tidak terbaca.",
  });
});

it("converts blank details to null", () => {
  const result = updateItemUnitInputSchema.parse({
    serialNumber: "   ",
    notes: "",
  });

  expect(result).toEqual({
    serialNumber: null,
    notes: null,
  });
});

it("accepts null to clear details", () => {
  const result = updateItemUnitInputSchema.parse({
    serialNumber: null,
    notes: null,
  });

  expect(result).toEqual({
    serialNumber: null,
    notes: null,
  });
});

const invalidCorrectionInputs: unknown[] = [
  null,
  [],
  "SERIAL-001",
  {},
  { serialNumber: 123 },
  { notes: false },
  { condition: "GOOD" },
  { serialNumber: "SERIAL-001", itemId: "another-item" },
  { notes: "Koreksi.", updatedById: "forged-actor" },
];

it.each(
  invalidCorrectionInputs.map((input) => ({ input })),
)("rejects invalid correction input: $input", ({ input }) => {
  const result = updateItemUnitInputSchema.safeParse(input);

  expect(result.success).toBe(false);
});
