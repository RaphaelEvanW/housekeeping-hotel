import { expect, it } from "vitest";

import { updateItemUnitInputSchema } from "../../src/server/item-unit-input";

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