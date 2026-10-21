import type { RoleCode } from "@/generated/prisma/enums";

export const permissionRoles = {
  // View only
  "dashboard:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "inventory:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "guests:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "borrowing:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "returns:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "maintenance:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "loss:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],
  "history:view": ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"],

  // Account and access administration
  "administration:view": ["SYSTEM_ADMIN"],

  // Business actions
  "borrowing:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:update": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:deactivation:request": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:deactivation:decide": ["HK_SUPERVISOR"],
  "inventory:item:deactivation:cancel": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:unit:update": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:stock:add": ["HK_STAFF", "HK_SUPERVISOR"],
  "inspection:verify": ["HK_SUPERVISOR"],
  "write-off:approve": ["MANAGEMENT"],
} as const satisfies Record<string, readonly RoleCode[]>;

export type Permission = keyof typeof permissionRoles;

export function hasPermission(
  roles: readonly RoleCode[],
  permission: Permission,
): boolean {
  const allowedRoles: readonly RoleCode[] = permissionRoles[permission];

  return roles.some((role) => allowedRoles.includes(role));
}
