import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { workspaceBreadcrumbs } from "../../src/lib/workspace-breadcrumbs";
import { WorkspaceBackButton } from "../../src/components/workspace-back-button";
import { WorkspacePageHeading } from "../../src/components/workspace-page-heading";
import { WorkspaceBreadcrumbs } from "../../src/components/workspace-breadcrumbs";
import { getNavigationItems } from "../../src/lib/navigation";

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/inventory/deactivation-requests" }));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("shows the nested page hierarchy without matching unrelated prefixes", () => {
  expect(workspaceBreadcrumbs("/inventory/deactivation-requests")).toEqual([
    { href: "/inventory", label: "Inventaris" },
    { href: "/inventory/deactivation-requests", label: "Pengajuan penonaktifan" },
  ]);
  expect(workspaceBreadcrumbs("/dashboard")[0].label).toBe("Dashboard Operasional");
  expect(workspaceBreadcrumbs("/administration")[0].label).toBe("Administrasi");
  expect(workspaceBreadcrumbs("/inventory-other")).toEqual([]);
});

it("renders current-route breadcrumbs instead of a static Portal Aset label", () => {
  const html = renderToStaticMarkup(WorkspaceBreadcrumbs());
  expect(html).toContain("Mövenpick Hotel");
  expect(html).toContain('href="/inventory"');
  expect(html).toContain('aria-current="page"');
  expect(html).toContain("Pengajuan penonaktifan");
  expect(html).not.toContain("Portal Aset");
});

it("uses actual browser back when history exists", () => {
  vi.stubGlobal("window", { history: { length: 2 } });
  WorkspaceBackButton({ fallbackHref: "/inventory" }).props.onClick();
  expect(router.back).toHaveBeenCalledOnce();
  expect(router.replace).not.toHaveBeenCalled();
});

it("uses a parent fallback when opened in a new tab", () => {
  vi.stubGlobal("window", { history: { length: 1 } });
  WorkspaceBackButton({ fallbackHref: "/inventory" }).props.onClick();
  expect(router.replace).toHaveBeenCalledWith("/inventory");
  expect(router.back).not.toHaveBeenCalled();
});

it("keeps a labelled icon button beside the heading, including error headings", () => {
  const html = renderToStaticMarkup(WorkspacePageHeading({ children: "Pengajuan penonaktifan", fallbackHref: "/inventory" }));
  expect(html).toContain('aria-label="Kembali ke halaman sebelumnya"');
  expect(html).toContain("rotate-180");
  expect(html).toContain("Pengajuan penonaktifan");
});

it("does not add back navigation to a root menu heading", () => {
  const html = renderToStaticMarkup(WorkspacePageHeading({ children: "Inventaris" }));
  expect(html).not.toContain('aria-label="Kembali ke halaman sebelumnya"');
});

it("exposes the guest page for permitted roles with matching breadcrumbs", () => {
  for (const role of ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const) {
    expect(getNavigationItems([role])).toContainEqual(
      expect.objectContaining({ href: "/guests", available: true }),
    );
  }
  expect(workspaceBreadcrumbs("/guests")).toEqual([
    { href: "/guests", label: "Tamu" },
  ]);
  expect(workspaceBreadcrumbs("/guests-other")).toEqual([]);
});

it("keeps the guest list as parent of a visit detail", () => {
  expect(workspaceBreadcrumbs("/guests/22222222-2222-4222-8222-222222222222")).toEqual([
    { href: "/guests", label: "Tamu" },
    { href: "/guests/22222222-2222-4222-8222-222222222222", label: "Detail tamu" },
  ]);
});
