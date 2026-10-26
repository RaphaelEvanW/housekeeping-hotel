import type { RoleCode } from "@/generated/prisma/enums";
import { hasPermission, type Permission } from "@/lib/permissions";

type NavigationItem = {
  label: string;
  href: string;
  permission: Permission;
};

const navigationItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    permission: "dashboard:view",
  },
  {
    label: "Inventaris",
    href: "/inventory",
    permission: "inventory:view",
  },
  {
    label: "Tamu",
    href: "/guests",
    permission: "guests:view",
  },
  {
    label: "Peminjaman",
    href: "/borrowings",
    permission: "borrowing:view",
  },
  {
    label: "Pengembalian",
    href: "/returns",
    permission: "returns:view",
  },
  {
    label: "Inspeksi & Perawatan",
    href: "/maintenance",
    permission: "maintenance:view",
  },
  {
    label: "Kehilangan",
    href: "/loss",
    permission: "loss:view",
  },
  {
    label: "Riwayat",
    href: "/history",
    permission: "history:view",
  },
  {
    label: "Administrasi",
    href: "/administration",
    permission: "administration:view",
  },
] as const satisfies readonly NavigationItem[];

const availableRoutes = new Set<string>([
  "/dashboard",
  "/inventory",
  "/guests",
  "/administration",
]);

export function getNavigationItems(roles: readonly RoleCode[]) {
  return navigationItems
    .filter((item) => hasPermission(roles, item.permission))
    .map((item) => ({
      ...item,
      available: availableRoutes.has(item.href),
    }));
}
