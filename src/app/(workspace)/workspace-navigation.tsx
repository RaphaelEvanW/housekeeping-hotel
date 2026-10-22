"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { WorkspaceIcon } from "@/components/workspace-icon";
import type { getNavigationItems } from "@/lib/navigation";

type WorkspaceNavigationProps = {
  items: ReturnType<typeof getNavigationItems>;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function WorkspaceNavigation({ items, collapsed = false, onNavigate }: WorkspaceNavigationProps) {
  const pathname = usePathname();
  const availableItems = items.filter((item) => item.available);
  const activeIndex = availableItems.findIndex(item => pathname === item.href || pathname.startsWith(`${item.href}/`));

  if (availableItems.length === 0) {
    return (
      <p className="px-3 py-2 text-sm">
        Belum ada menu yang dapat diakses oleh akun ini.
      </p>
    );
  }

  return (
    <nav aria-label="Navigasi utama" className="relative isolate">
      {activeIndex >= 0 ? <span aria-hidden="true" className="sidebar-glass pointer-events-none absolute inset-x-0 top-0 h-11 rounded-md motion-safe:transition-transform motion-safe:duration-[380ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: `translateY(${activeIndex * 48}px)` }} /> : null}
      <ul className="relative space-y-1">
        {availableItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const label = item.href === "/dashboard" ? "Dashboard Operasional" : item.href === "/inventory" ? "Inventaris & Aset" : item.label;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onNavigate={onNavigate}
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex h-11 items-center rounded py-2 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-accent ${collapsed ? "justify-center px-0" : "px-4"} ${
                  isActive
                    ? "text-ws-accent"
                    : "text-ws-muted hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {item.href === "/dashboard" || item.href === "/inventory" ? (
                    <Image src={`/figma/${item.href === "/dashboard" ? "dashboard" : "inventory"}.svg`} width={14} height={14} alt="" className="shrink-0" />
                  ) : <WorkspaceIcon href={item.href} />}
                  <span className={collapsed ? "sr-only" : "whitespace-nowrap"}>{label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
