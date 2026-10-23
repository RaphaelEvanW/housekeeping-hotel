import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/permissions";
import { requireActiveUser } from "@/server/require-active-user";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default async function AdministrationPage() {
  const user = await requireActiveUser();

  if (!hasPermission(user.roles, "administration:view")) {
    redirect("/access-denied");
  }

  return (
    <main className="p-4 md:p-6">
      <WorkspacePageHeading>
        <h1 className="text-2xl font-semibold tracking-tight text-ws-strong">
          Administrasi
        </h1>

        <p className="mt-2 text-sm text-ws-text">
          Pengelolaan akun dan akses akan tersedia di halaman ini.
        </p>
      </WorkspacePageHeading>
    </main>
  );
}
