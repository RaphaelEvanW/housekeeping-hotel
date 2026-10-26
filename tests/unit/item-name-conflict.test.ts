import { expect, it } from "vitest";
import { Prisma } from "../../src/generated/prisma/client";
import { isItemNameConflict } from "../../src/server/item-name-conflict";

function uniqueError(meta: Record<string, unknown>, code = "P2002") {
  return new Prisma.PrismaClientKnownRequestError("Constraint failure", { code, clientVersion: "7.10.0", meta });
}

it("recognizes the normalized-name index reported by adapter-pg", () => {
  const cause = { kind: "UniqueConstraintViolation", constraint: { index: "item_normalizedName_key" }, table: "item" };
  expect(isItemNameConflict(uniqueError({ driverAdapterError: { cause } }))).toBe(true);
});

it("also accepts field-based adapter metadata and legacy Prisma targets", () => {
  expect(isItemNameConflict(uniqueError({ driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { fields: ["normalizedName"] } } } }))).toBe(true);
  expect(isItemNameConflict(uniqueError({ target: ["normalizedName"] }))).toBe(true);
  expect(isItemNameConflict(uniqueError({ target: "item_normalizedName_key" }))).toBe(true);
});

it("does not misreport photo uniqueness, other failures or malformed metadata as duplicate names", () => {
  for (const meta of [
    { driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "item_photo_photoKey_key" } } } },
    { target: ["photoKey"] }, { target: ["id"] }, {},
    { driverAdapterError: null }, { driverAdapterError: { cause: null } },
  ]) expect(isItemNameConflict(uniqueError(meta))).toBe(false);
  expect(isItemNameConflict(uniqueError({ target: ["normalizedName"] }, "P2003"))).toBe(false);
  expect(isItemNameConflict(new Error("item_normalizedName_key"))).toBe(false);
});
