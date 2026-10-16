import type { RoleCode } from "@/generated/prisma/enums";

export const permissionRoles = {
  "borrowing:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "inspection:verify": ["HK_SUPERVISOR"],
  "write-off:approve": ["MANAGEMENT"],
} as const satisfies Record<string, readonly RoleCode[]>;

export type Permission = keyof typeof permissionRoles;

export function hasPermission(
  roles: readonly RoleCode[],
  permission: Permission,
): boolean {
  const allowedRoles: readonly RoleCode[] =
    permissionRoles[permission];

  return roles.some((role) => allowedRoles.includes(role));
}