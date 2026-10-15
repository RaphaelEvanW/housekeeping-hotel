import { requireActiveUser } from "@/server/require-active-user";

import { LogoutButton } from "./logout-button";

export default async function DashboardPage() {
  const user = await requireActiveUser();

  return (
    <main className="p-6">
      <LogoutButton />
      <h1 className="text-2xl font-semibold">
        Selamat datang, {user.name}
      </h1>
      <p className="mt-2">ini Housekeeping.</p>
    </main>
  );
}