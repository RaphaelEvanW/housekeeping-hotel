import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorizeApi } from "../../src/server/authorize-api";
import { getActiveUser } from "../../src/server/get-active-user";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const mockGetActiveUser = vi.mocked(getActiveUser);

type ActiveUser = NonNullable<
  Awaited<ReturnType<typeof getActiveUser>>
>;

beforeEach(() => {
  mockGetActiveUser.mockReset();
});

describe("authorizeApi", () => {
  it("returns JSON 401 when there is no active user", async () => {
    mockGetActiveUser.mockResolvedValue(null);

    const result = await authorizeApi("borrowing:create");

    expect(result.authorized).toBe(false);

    if (result.authorized) {
      throw new Error("Expected authorization to be denied");
    }

    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("Cache-Control")).toBe("no-store");
    expect(result.response.headers.get("Location")).toBeNull();

    await expect(result.response.json()).resolves.toMatchObject({
      error: "UNAUTHORIZED",
    });
  });

  it("returns JSON 403 when the active user lacks permission", async () => {
    mockGetActiveUser.mockResolvedValue({
      id: "test-admin",
      name: "Test Admin",
      isActive: true,
      roles: ["SYSTEM_ADMIN"],
    });

    const result = await authorizeApi("borrowing:create");

    expect(result.authorized).toBe(false);

    if (result.authorized) {
      throw new Error("Expected authorization to be denied");
    }

    expect(result.response.status).toBe(403);
    expect(result.response.headers.get("Cache-Control")).toBe("no-store");
    expect(result.response.headers.get("Location")).toBeNull();

    await expect(result.response.json()).resolves.toMatchObject({
      error: "FORBIDDEN",
    });
  });

  it("returns the user when permission is granted", async () => {
    const user: ActiveUser = {
      id: "test-staff",
      name: "Test Staff",
      isActive: true,
      roles: ["HK_STAFF"],
    };

    mockGetActiveUser.mockResolvedValue(user);

    await expect(
      authorizeApi("borrowing:create"),
    ).resolves.toEqual({
      authorized: true,
      user,
    });

    expect(mockGetActiveUser).toHaveBeenCalledOnce();
  });

  it("propagates lookup failures instead of returning 401 or 403", async () => {
    const databaseError = new Error("Database unavailable");

    mockGetActiveUser.mockRejectedValue(databaseError);

    await expect(
      authorizeApi("borrowing:create"),
    ).rejects.toBe(databaseError);
  });
});