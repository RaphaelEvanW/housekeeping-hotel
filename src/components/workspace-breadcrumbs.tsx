"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { workspaceBreadcrumbs } from "@/lib/workspace-breadcrumbs";

export function WorkspaceBreadcrumbs() {
  const trail = workspaceBreadcrumbs(usePathname());

  return (
    <nav aria-label="Lokasi halaman" className="min-w-0 font-heading text-sm text-ws-strong sm:text-base">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <li className="font-semibold">Mövenpick Hotel</li>
        {trail.map((page, index) => (
          <li key={page.href} className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="text-ws-text">/</span>
            {index === trail.length - 1 ? (
              <span aria-current="page" className="break-words">{page.label}</span>
            ) : (
              <Link href={page.href} className="inline-flex min-h-11 items-center rounded hover:text-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">{page.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
