import "server-only";

import { hasPermission, type Permission } from "@/lib/permissions";
import { getActiveUser } from "@/server/get-active-user";

type ActiveUser = NonNullable<
  Awaited<ReturnType<typeof getActiveUser>>
>;

type AuthorizationResult =
  | { authorized: true; user: ActiveUser }
  | { authorized: false; response: Response };

export async function authorizeApi(
  permission: Permission,
): Promise<AuthorizationResult> {
  const user = await getActiveUser();

  if (!user) {
    return {
      authorized: false,
      response: Response.json(
        {
          error: "UNAUTHORIZED",
          message: "Silakan masuk dengan akun aktif.",
        },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      ),
    };
  }

  if (!hasPermission(user.roles, permission)) {
    return {
      authorized: false,
      response: Response.json(
        {
          error: "FORBIDDEN",
          message: "Anda tidak memiliki izin untuk tindakan ini.",
        },
        {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        },
      ),
    };
  }

  return {
    authorized: true,
    user,
  };
}