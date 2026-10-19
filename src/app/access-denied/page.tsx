import Link from "next/link";

import { getNavigationItems } from "@/lib/navigation";
import { requireActiveUser } from "@/server/require-active-user";

import { LogoutButton } from "@/components/logout-button";

export default async function AccessDeniedPage() {
  const user = await requireActiveUser();

  const availablePages = getNavigationItems(user.roles).filter(
    (item) => item.available,
  );

  return (
    <main className="grid min-h-svh place-items-center bg-stone-50 px-6 py-10 text-stone-900">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">
          Akses tidak tersedia
        </h1>

        <p className="mt-3 text-stone-600">
          Akun {user.name} tidak memiliki izin untuk membuka halaman
          yang dituju.
        </p>

        {availablePages.length > 0 ? (
          <nav aria-label="Halaman yang dapat diakses" className="mt-6">
            <ul className="space-y-3">
              {availablePages.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-amber-900 underline underline-offset-4"
                  >
                    Buka {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <p className="mt-4 text-sm text-stone-600">
            Belum ada halaman yang tersedia untuk role akun ini.
            Hubungi pengelola akses jika diperlukan.
          </p>
        )}

        <LogoutButton />
      </div>
    </main>
  );
}