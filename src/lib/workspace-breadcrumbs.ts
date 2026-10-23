const pages = [
  { href: "/dashboard", label: "Dashboard Operasional" },
  { href: "/inventory", label: "Inventaris" },
  { href: "/inventory/deactivation-requests", label: "Pengajuan penonaktifan" },
  { href: "/administration", label: "Administrasi" },
] as const;

export function workspaceBreadcrumbs(pathname: string) {
  return pages.filter(page => pathname === page.href || pathname.startsWith(`${page.href}/`));
}
