import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/permissions";
import { requireActiveUser } from "@/server/require-active-user";

export default async function DashboardPage() {
  const user = await requireActiveUser();

  if (!hasPermission(user.roles, "dashboard:view")) {
    redirect("/access-denied");
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">
        Selamat datang, {user.name}
      </h1>

      <p className="mt-2 text-stone-600">
        Ringkasan operasional belum tersedia.
      </p>
    </main>
  );
}