import type { ReactNode } from "react";

import { getNavigationItems } from "@/lib/navigation";
import { requireActiveUser } from "@/server/require-active-user";

import { WorkspaceNavigation } from "./workspace-navigation";

import { LogoutButton } from "@/components/logout-button";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export default async function WorkspaceLayout({
  children,
}: WorkspaceLayoutProps) {
  const user = await requireActiveUser();
  const navigationItems = getNavigationItems(user.roles);

  return (
    <div className="min-h-svh bg-stone-50 text-stone-900 md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden border-r border-stone-200 bg-white p-4 md:block">
        <p className="mb-6 px-3 font-serif text-2xl font-semibold text-amber-950">
          Housekeeping
        </p>

        <WorkspaceNavigation items={navigationItems} />
      </aside>

      <div className="min-w-0">
        <header className="border-b border-stone-200 bg-white px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words py-2 text-sm text-stone-600">
                Masuk sebagai{" "}
                <span className="font-medium text-stone-900">
                    {user.name}
                </span>
                </p>

            <LogoutButton />
          </div>

          <details className="mt-3 md:hidden">
            <summary className="cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-amber-800">
              Menu navigasi
            </summary>

            <div className="pt-2">
              <WorkspaceNavigation items={navigationItems} />
            </div>
          </details>
        </header>

        {children}
      </div>
    </div>
  );
}