const pages = [
  { href: "/dashboard", label: "Dashboard Operasional" },
  { href: "/inventory", label: "Inventaris" },
  { href: "/inventory/deactivation-requests", label: "Pengajuan penonaktifan" },
  { href: "/guests", label: "Tamu" },
  { href: "/administration", label: "Administrasi" },
] as const;

export function workspaceBreadcrumbs(pathname: string) {
  const trail: { href: string; label: string }[] = pages.filter(page => pathname === page.href || pathname.startsWith(`${page.href}/`));
  if (/^\/guests\/[^/]+\/?$/.test(pathname)) trail.push({ href: pathname, label: "Detail tamu" });
  return trail;
}
