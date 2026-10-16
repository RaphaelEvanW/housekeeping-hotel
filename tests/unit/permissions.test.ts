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