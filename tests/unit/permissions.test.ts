import { describe, expect, it } from "vitest";

import { hasPermission } from "../../src/lib/permissions";

describe("hasPermission", () => {
  it("allows staff and supervisors to create borrowings", () => {
    expect(
      hasPermission(["HK_STAFF"], "borrowing:create"),
    ).toBe(true);

    expect(
      hasPermission(["HK_SUPERVISOR"], "borrowing:create"),
    ).toBe(true);
  });

  it("allows staff and supervisors to create master items", () => {
    expect(
      hasPermission(["HK_STAFF"], "inventory:item:create"),
    ).toBe(true);

    expect(
      hasPermission(["HK_SUPERVISOR"], "inventory:item:create"),
    ).toBe(true);

    expect(
      hasPermission(["MANAGEMENT"], "inventory:item:create"),
    ).toBe(false);

    expect(
      hasPermission(["SYSTEM_ADMIN"], "inventory:item:create"),
    ).toBe(false);
  });

  

  it("reserves inspection verification for supervisors", () => {
    expect(
      hasPermission(["HK_SUPERVISOR"], "inspection:verify"),
    ).toBe(true);

    expect(
      hasPermission(["HK_STAFF"], "inspection:verify"),
    ).toBe(false);
  });

  it("reserves write-off approval for management", () => {
    expect(
      hasPermission(["MANAGEMENT"], "write-off:approve"),
    ).toBe(true);

    expect(
      hasPermission(["HK_SUPERVISOR"], "write-off:approve"),
    ).toBe(false);

    expect(
      hasPermission(["SYSTEM_ADMIN"], "write-off:approve"),
    ).toBe(false);
  });

  it("does not give system admins implicit operational access", () => {
    expect(
      hasPermission(["SYSTEM_ADMIN"], "borrowing:create"),
    ).toBe(false);

    expect(
      hasPermission(["SYSTEM_ADMIN"], "inspection:verify"),
    ).toBe(false);
  });

  it("allows access when one of multiple roles grants permission", () => {
    expect(
      hasPermission(
        ["SYSTEM_ADMIN", "MANAGEMENT"],
        "write-off:approve",
      ),
    ).toBe(true);
  });

  it("denies access when the user has no roles", () => {
    expect(hasPermission([], "borrowing:create")).toBe(false);
    expect(hasPermission([], "inspection:verify")).toBe(false);
    expect(hasPermission([], "write-off:approve")).toBe(false);
  });
});

describe("page permissions", () => {
  const operationalPermissions = [
    "dashboard:view",
    "inventory:view",
    "guests:view",
    "borrowing:view",
    "returns:view",
    "maintenance:view",
    "loss:view",
    "history:view",
  ] as const;

  it.each(operationalPermissions)(
    "allows operational roles and denies IT-only access to %s",
    (permission) => {
      expect(hasPermission(["HK_STAFF"], permission)).toBe(true);
      expect(hasPermission(["HK_SUPERVISOR"], permission)).toBe(true);
      expect(hasPermission(["MANAGEMENT"], permission)).toBe(true);

      expect(hasPermission(["SYSTEM_ADMIN"], permission)).toBe(false);
      expect(hasPermission([], permission)).toBe(false);
    },
  );

  it("does not grant operational actions through Management read access", () => {
    expect(
      hasPermission(["MANAGEMENT"], "borrowing:create"),
    ).toBe(false);

    expect(
      hasPermission(["MANAGEMENT"], "inspection:verify"),
    ).toBe(false);
  });

  it("reserves administration access for IT", () => {
    expect(
      hasPermission(["SYSTEM_ADMIN"], "administration:view"),
    ).toBe(true);

    expect(
      hasPermission(["HK_STAFF"], "administration:view"),
    ).toBe(false);

    expect(
      hasPermission(["HK_SUPERVISOR"], "administration:view"),
    ).toBe(false);

    expect(
      hasPermission(["MANAGEMENT"], "administration:view"),
    ).toBe(false);

    expect(
      hasPermission([], "administration:view"),
    ).toBe(false);
  });

  it("combines IT and operational access when both roles are assigned", () => {
    const roles = ["SYSTEM_ADMIN", "HK_STAFF"] as const;

    expect(hasPermission(roles, "administration:view")).toBe(true);
    expect(hasPermission(roles, "inventory:view")).toBe(true);
    expect(hasPermission(roles, "borrowing:create")).toBe(true);

    expect(hasPermission(roles, "write-off:approve")).toBe(false);
  });
});