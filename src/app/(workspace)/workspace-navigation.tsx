"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { getNavigationItems } from "@/lib/navigation";

type WorkspaceNavigationProps = {
  items: ReturnType<typeof getNavigationItems>;
};

export function WorkspaceNavigation({
  items,
}: WorkspaceNavigationProps) {
  const pathname = usePathname();

  if (items.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-stone-600">
        Belum ada menu yang dapat diakses oleh akun ini.
      </p>
    );
  }

  return (
    <nav aria-label="Navigasi utama">
      <ul className="space-y-1">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              {item.available ? (
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 ${
                    isActive
                      ? "bg-amber-100 font-semibold text-amber-950"
                      : "text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <span className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm text-stone-600">
                  <span>{item.label}</span>
                  <span className="shrink-0 text-xs">Segera</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}