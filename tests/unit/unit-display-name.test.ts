import { expect, it } from "vitest";
import { normalizeUnitName, unitDisplayName } from "../../src/lib/unit-display-name";

it.each([
  ["  Hair   dryer\t01  ", "Hair dryer 01"],
  ["", null],
  ["  \n ", null],
] as const)("normalizes optional form name %j to %j", (value, expected) => {
  expect(normalizeUnitName(value)).toBe(expected);
});

it("uses the unit name, then serial, then stable asset code", () => {
  expect(unitDisplayName({ name: "  Doraemon EP 1  ", serialNumber: "SER-1", unitCode: "HK-000002" })).toBe("Doraemon EP 1");
  expect(unitDisplayName({ name: null, serialNumber: "SER-1", unitCode: "HK-000002" })).toBe("SER-1");
  expect(unitDisplayName({ name: " ", serialNumber: null, unitCode: "HK-000002" })).toBe("HK-000002");
});
