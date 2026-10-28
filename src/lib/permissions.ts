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
  "guests:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "guests:update": ["HK_STAFF", "HK_SUPERVISOR"],
  "guests:checkout": ["HK_STAFF", "HK_SUPERVISOR"],
  "borrowing:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "loss:report": ["HK_STAFF", "HK_SUPERVISOR"],
  "loss:decide": ["HK_SUPERVISOR"],
  "loss:recover": ["HK_STAFF", "HK_SUPERVISOR"],
  "loss:settle:propose": ["HK_STAFF", "HK_SUPERVISOR"],
  "loss:settle:decide": ["HK_SUPERVISOR"],
  "returns:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:create": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:update": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:deactivation:request": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:item:deactivation:decide": ["HK_SUPERVISOR"],
  "inventory:item:deactivation:cancel": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:unit:update": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:unit:damage:report": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:unit:condition:update": ["HK_STAFF", "HK_SUPERVISOR"],
  "maintenance:handover": ["HK_STAFF", "HK_SUPERVISOR"],
  "maintenance:receive": ["HK_STAFF", "HK_SUPERVISOR"],
  "inventory:stock:add": ["HK_STAFF", "HK_SUPERVISOR"],
  "inspection:verify": ["HK_SUPERVISOR"],
  "write-off:propose": ["HK_SUPERVISOR"],
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
