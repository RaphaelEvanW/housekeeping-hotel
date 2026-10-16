import "server-only";

import { hasPermission, type Permission } from "@/lib/permissions";
import { requireActiveUser } from "@/server/require-active-user";

export class PermissionDeniedError extends Error {
  constructor() {
    super("Anda tidak memiliki izin untuk melakukan tindakan ini.");
    this.name = "PermissionDeniedError";
  }
}

export async function requirePermission(permission: Permission) {
  const user = await requireActiveUser();

  if (!hasPermission(user.roles, permission)) {
    throw new PermissionDeniedError();
  }

  return user;
}