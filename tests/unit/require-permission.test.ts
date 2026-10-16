import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireActiveUser } from "../../src/server/require-active-user";
import {
  PermissionDeniedError,
  requirePermission,
} from "../../src/server/require-permission";

vi.mock("../../src/server/require-active-user", () => ({
  requireActiveUser: vi.fn(),
}));

const mockRequireActiveUser = vi.mocked(requireActiveUser);

beforeEach(() => {
  mockRequireActiveUser.mockReset();
});

describe("requirePermission", () => {
  it("returns the active user when permission is granted", async () => {
    const user = {
      id: "test-staff",
      name: "Test Staff",
      isActive: true as const,
      roles: ["HK_STAFF"] as const,
    };

    mockRequireActiveUser.mockResolvedValue({
      ...user,
      roles: [...user.roles],
    });

    await expect(
      requirePermission("borrowing:create"),
    ).resolves.toEqual(user);

    expect(mockRequireActiveUser).toHaveBeenCalledOnce();
  });

  it("rejects an active user without the required permission", async () => {
    mockRequireActiveUser.mockResolvedValue({
      id: "test-admin",
      name: "Test Admin",
      isActive: true,
      roles: ["SYSTEM_ADMIN"],
    });

    await expect(
      requirePermission("write-off:approve"),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("rejects a user without roles", async () => {
    mockRequireActiveUser.mockResolvedValue({
      id: "test-no-role",
      name: "Test User",
      isActive: true,
      roles: [],
    });

    await expect(
      requirePermission("borrowing:create"),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("preserves rejection from the active-user check", async () => {
    const rejection = new Error("REDIRECT:/login");

    mockRequireActiveUser.mockRejectedValue(rejection);

    await expect(
      requirePermission("borrowing:create"),
    ).rejects.toBe(rejection);
  });
});
