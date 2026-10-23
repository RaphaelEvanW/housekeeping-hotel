import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import { getNavigationItems } from "@/lib/navigation";
import { requireActiveUser } from "@/server/require-active-user";

import { WorkspaceShell } from "./workspace-shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

type WorkspaceLayoutProps = { children: ReactNode };

export default async function WorkspaceLayout({
  children,
}: WorkspaceLayoutProps) {
  const user = await requireActiveUser();
  const navigationItems = getNavigationItems(user.roles);

  return (
    <div className={inter.variable}>
      <WorkspaceShell userName={user.name} items={navigationItems}>
        {children}
      </WorkspaceShell>
    </div>
  );
}
