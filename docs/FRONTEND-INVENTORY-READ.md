# Langkah frontend: inventory read

22 Oktober 2026. Panduan awal ini sudah diterapkan oleh agent atas izin satu kali dari pemilik. Source aktual juga mencakup penyesuaian responsif dan pemisahan state penguasaan/kehilangan; jangan menyalin ulang blok historis di bawah untuk menimpa source. Gunakan DESIGN_SYSTEM.md untuk arah visual. Scope: pencarian jenis barang, pagination, pilihan barang, dan daftar unit nyata. Panel riwayat, foto/upload, create/edit/Add Stock tetap pekerjaan berikutnya.

## 1. Buat src/app/(workspace)/inventory/page.tsx

Halaman ini Server Component. Authorization dijalankan sebelum membaca database. Query list memakai schema yang sudah ada; parameter unit memakai batas yang sama dengan endpoint unit. URL menyimpan pilihan dan pagination supaya navigasi bisa diulang.

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hasPermission } from "@/lib/permissions";
import { getItemUnits } from "@/server/item-units";
import { listItems } from "@/server/list-items";
import { listItemsInputSchema } from "@/server/list-items-input";
import { requireActiveUser } from "@/server/require-active-user";

export const metadata: Metadata = { title: "Inventaris | Housekeeping" };

type SearchParams = Record<string, string | string[] | undefined>;

const selectionSchema = z.object({
  item: z.string().uuid().optional(),
  after: z.string().regex(/^[1-9]\d*$/u).transform(Number)
    .pipe(z.number().int().positive().max(2_147_483_647)).optional(),
});

const conditionLabels = {
  GOOD: "Baik",
  MINOR_DAMAGE: "Rusak ringan",
  DAMAGED: "Rusak",
  MISSING_PART: "Komponen kurang",
} as const;

const readinessLabels = {
  CLEAR: "Tanpa penahanan",
  ON_HOLD: "Ditahan",
  PENDING_INSPECTION: "Menunggu inspeksi",
  PENDING_VERIFICATION: "Menunggu verifikasi",
} as const;

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-md border border-hk-control bg-hk-surface px-3 text-sm font-medium text-hk-strong transition-colors hover:bg-hk-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hk-focus motion-reduce:transition-none";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
});

export default async function InventoryPage({ searchParams }: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireActiveUser();
  if (!hasPermission(user.roles, "inventory:view")) redirect("/access-denied");

  const raw = await searchParams;
  const query = listItemsInputSchema.safeParse({
    q: raw.q, page: raw.page, pageSize: "20",
  });
  const selection = selectionSchema.safeParse({ item: raw.item, after: raw.after });

  if (!query.success || !selection.success || (selection.data.after && !selection.data.item)) {
    return (
      <main className="p-4 md:p-6">
        <h1 className="text-2xl font-semibold text-hk-strong">Inventaris</h1>
        <p role="alert" className="mt-4 text-sm text-hk-danger">Parameter pencarian atau pilihan barang tidak valid.</p>
        <Link href="/inventory" className={`${buttonClass} mt-4`}>Reset tampilan</Link>
      </main>
    );
  }

  const { q, page } = query.data;
  const { item: selectedId, after } = selection.data;
  const [result, selected] = await Promise.all([
    listItems(query.data),
    selectedId ? getItemUnits(selectedId, after) : Promise.resolve(null),
  ]);

  if (page > 1 && page > Math.max(1, result.pagination.totalPages)) {
    redirect(`/inventory?${new URLSearchParams({ q, page: "1" })}`);
  }

  function href(values: { page?: number; item?: string; after?: number }) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(values.page ?? page));
    if (values.item) params.set("item", values.item);
    if (values.after) params.set("after", String(values.after));
    return `/inventory?${params}`;
  }

  const start = result.pagination.total === 0 ? 0 : (page - 1) * 20 + 1;
  const end = Math.min(page * 20, result.pagination.total);

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <header>
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight text-hk-strong">Inventaris</h1>
        <p className="mt-2 text-sm leading-6">Jenis barang dan unit fisik, tercatat dalam satu ruang kerja.</p>
      </header>

      <section aria-labelledby="item-list-heading" className="overflow-hidden rounded-lg border border-hk-divider bg-hk-surface">
        <div className="flex flex-col gap-4 border-b border-hk-divider p-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <div>
            <h2 id="item-list-heading" className="font-semibold text-hk-strong">Jenis barang</h2>
            <p className="mt-1 text-xs tabular-nums">{result.pagination.total} hasil{q ? ` untuk “${q}”` : ""}</p>
          </div>
          <form action="/inventory" method="get" className="flex w-full gap-2 sm:max-w-md">
            <label htmlFor="item-search" className="sr-only">Cari nama barang</label>
            <input key={q} id="item-search" name="q" defaultValue={q} maxLength={100} placeholder="Cari nama barang" className="min-h-11 min-w-0 flex-1 rounded-md border border-hk-control bg-hk-background px-3 text-sm text-hk-strong placeholder:text-hk-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hk-focus" />
            <button type="submit" className={buttonClass}>Cari</button>
          </form>
        </div>

        {result.items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="font-medium text-hk-strong">{q ? "Barang tidak ditemukan" : "Belum ada jenis barang"}</h3>
            <p className="mt-2 text-sm">{q ? "Coba nama lain atau hapus pencarian." : "Jenis barang yang didaftarkan akan tampil di sini."}</p>
            {q ? <Link href="/inventory" className={`${buttonClass} mt-4`}>Hapus pencarian</Link> : null}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Daftar jenis barang</caption>
            <thead className="text-xs text-hk-text">
              <tr><th scope="col" className="px-4 py-3 font-medium md:px-5">Nama barang</th><th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Status</th><th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Diperbarui</th><th scope="col" className="px-4 py-3 text-right font-medium md:px-5">Aksi</th></tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id} className={`border-t border-hk-divider ${selectedId === item.id ? "bg-hk-elevated" : "hover:bg-hk-elevated/40"}`}>
                  <th scope="row" className="px-4 py-4 font-medium text-hk-strong md:px-5">
                    <span className="block break-words">{item.name}</span>
                    <span className="mt-1 block text-xs font-normal text-hk-text md:hidden">{item.isActive ? "Aktif" : "Nonaktif"}</span>
                    <span className="mt-1 block text-xs font-normal text-hk-text lg:hidden">Diperbarui {dateFormat.format(item.updatedAt)}</span>
                  </th>
                  <td className="hidden px-4 py-4 md:table-cell"><span className={`inline-flex items-center gap-2 ${item.isActive ? "text-hk-success" : "text-hk-text"}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{item.isActive ? "Aktif" : "Nonaktif"}</span></td>
                  <td className="hidden px-4 py-4 text-hk-text tabular-nums lg:table-cell">{dateFormat.format(item.updatedAt)}</td>
                  <td className="px-4 py-4 text-right md:px-5"><Link href={href({ item: item.id })} scroll={false} aria-label={`Lihat unit ${item.name}`} aria-current={selectedId === item.id ? "true" : undefined} className={`${buttonClass} whitespace-nowrap`}>Lihat unit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <nav aria-label="Halaman jenis barang" className="flex flex-wrap items-center justify-between gap-3 border-t border-hk-divider p-4 md:px-5">
          <p className="text-xs tabular-nums">Menampilkan {start}–{end} dari {result.pagination.total} jenis barang</p>
          <div className="flex items-center gap-2">
            {page > 1 ? <Link href={href({ page: page - 1 })} className={buttonClass}>Sebelumnya</Link> : <button disabled className={`${buttonClass} cursor-not-allowed opacity-50`}>Sebelumnya</button>}
            <span aria-current="page" className="px-2 text-sm text-hk-strong tabular-nums">{page}</span>
            {result.pagination.hasNextPage ? <Link href={href({ page: page + 1 })} className={buttonClass}>Berikutnya</Link> : <button disabled className={`${buttonClass} cursor-not-allowed opacity-50`}>Berikutnya</button>}
          </div>
        </nav>
      </section>

      {selectedId ? (
        <section aria-labelledby="units-heading" className="rounded-lg border border-hk-divider bg-hk-surface p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="units-heading" className="text-lg font-semibold text-hk-strong">{selected ? `Unit ${selected.item.name}` : "Barang tidak ditemukan"}</h2>
              <p className="mt-1 text-sm">{selected ? `${selected.totalRegistered} unit terdaftar. Jumlah ini bukan jumlah siap dipinjam.` : "Pilihan barang ini sudah tidak tersedia."}</p>
            </div>
            <Link href={href({})} scroll={false} className={buttonClass}>Tutup daftar unit</Link>
          </div>
          {selected ? (
            <div className="mt-5">
              {selected.units.length === 0 ? <p className="py-6 text-sm">{after ? "Tidak ada unit setelah halaman ini." : "Belum ada unit fisik untuk jenis barang ini."}</p> : (
                <ul className="divide-y divide-hk-divider">
                  {selected.units.map((unit) => (
                    <li key={unit.id} className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4">
                      <div><p className="font-medium text-hk-strong tabular-nums">{unit.unitCode}</p><p className="mt-1 break-words text-xs">Nomor seri: {unit.serialNumber || "Belum dicatat"}</p></div>
                      <div><p className="text-sm text-hk-strong">{conditionLabels[unit.condition]}</p><p className={`mt-1 text-xs ${unit.readiness === "CLEAR" ? "text-hk-text" : "text-hk-warning"}`}>{readinessLabels[unit.readiness]}</p></div>
                      <div><p className="break-words text-sm">{unit.location?.name ?? "Lokasi belum dicatat"}</p><p className="mt-1 text-xs">Lifecycle: {unit.lifecycle === "ACTIVE" ? "Aktif" : "Dipensiunkan"}</p></div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {after ? <Link href={href({ item: selectedId })} scroll={false} className={buttonClass}>Kembali ke unit pertama</Link> : null}
                {selected.nextCursor ? <Link href={href({ item: selectedId, after: selected.nextCursor })} scroll={false} className={buttonClass}>Unit berikutnya</Link> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
```

## 2. Buat src/app/(workspace)/inventory/loading.tsx

```tsx
export default function InventoryLoading() {
  return (
    <div role="status" aria-label="Memuat inventaris" className="space-y-6 p-4 md:p-6 lg:p-8">
      <div aria-hidden="true" className="h-9 w-40 rounded-md bg-hk-elevated" />
      <div aria-hidden="true" className="overflow-hidden rounded-lg border border-hk-divider bg-hk-surface">
        <div className="h-20 border-b border-hk-divider" />
        {[0, 1, 2, 3, 4].map((row) => <div key={row} className="border-b border-hk-divider p-5"><div className="h-5 w-1/3 rounded bg-hk-elevated" /></div>)}
      </div>
      <span className="sr-only">Memuat inventaris…</span>
    </div>
  );
}
```

## 3. Buat src/app/(workspace)/inventory/error.tsx

```tsx
"use client";

export default function InventoryError({ reset }: { reset: () => void }) {
  return (
    <main className="p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-hk-strong">Inventaris</h1>
      <div role="alert" className="mt-6 rounded-lg border border-hk-divider bg-hk-surface p-6">
        <h2 className="font-medium text-hk-strong">Data belum berhasil dimuat</h2>
        <p className="mt-2 text-sm">Coba lagi. Jika masalah berlanjut, hubungi pengelola aplikasi.</p>
        <button onClick={reset} className="mt-5 min-h-11 rounded-md bg-hk-primary px-4 text-sm font-medium text-white hover:bg-hk-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hk-focus">Coba lagi</button>
      </div>
    </main>
  );
}
```

## 4. Aktifkan route di src/lib/navigation.ts

Ganti deklarasi `availableRoutes` saja:

```tsx
const availableRoutes = new Set<string>([
  "/dashboard",
  "/inventory",
  "/administration",
]);
```

## 5. Koreksi logout yang tenggelam di background gelap

`LogoutButton` juga dipakai halaman access-denied yang terang. Di `src/components/logout-button.tsx`, ganti hanya `className` tombol dengan:

```tsx
className="min-h-11 rounded-md border border-current px-4 py-2 text-sm font-medium text-inherit hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-wait disabled:opacity-50"
```

Ganti className paragraf `role="status"` menjadi berikut agar pesan tetap terbaca sesuai warna teks induk di kedua halaman:

```tsx
className="mt-2 max-w-64 text-sm text-inherit"
```

Jangan mengubah handler signOut.

## 6. Lengkapi identitas navigasi

Di `src/app/(workspace)/workspace-navigation.tsx`, tambahkan konstanta berikut setelah deklarasi `WorkspaceNavigationProps`. Path SVG diambil melalui Better Icons CLI dari Phosphor (`ph:house`, `ph:cube`, `ph:users-three`, lisensi MIT); tidak perlu package ikon.

```tsx
const navigationIcons: Record<string, string> = {
  "/dashboard": "m219.31 108.68-80-80a16 16 0 0 0-22.62 0l-80 80A15.87 15.87 0 0 0 32 120v96a8 8 0 0 0 8 8h64a8 8 0 0 0 8-8v-56h32v56a8 8 0 0 0 8 8h64a8 8 0 0 0 8-8v-96a15.87 15.87 0 0 0-4.69-11.32M208 208h-48v-56a8 8 0 0 0-8-8h-48a8 8 0 0 0-8 8v56H48v-88l80-80 80 80Z",
  "/inventory": "m223.68 66.15-88-48.15a15.88 15.88 0 0 0-15.36 0l-88 48.17a16 16 0 0 0-8.32 14v95.64a16 16 0 0 0 8.32 14l88 48.17a15.88 15.88 0 0 0 15.36 0l88-48.17a16 16 0 0 0 8.32-14V80.18a16 16 0 0 0-8.32-14.03M128 32l80.34 44L128 120 47.66 76ZM40 90l80 43.78v85.79l-80-43.75Zm96 129.57v-85.75L216 90v85.78Z",
  "/administration": "M244.8 150.4a8 8 0 0 1-11.2-1.6A51.6 51.6 0 0 0 192 128a8 8 0 0 1-7.37-4.89a8 8 0 0 1 0-6.22A8 8 0 0 1 192 112a24 24 0 1 0-23.24-30a8 8 0 1 1-15.5-4A40 40 0 1 1 219 117.51a67.94 67.94 0 0 1 27.43 21.68a8 8 0 0 1-1.63 11.21M190.92 212a8 8 0 1 1-13.84 8a57 57 0 0 0-98.16 0a8 8 0 1 1-13.84-8a72.06 72.06 0 0 1 33.74-29.92a48 48 0 1 1 58.36 0A72.06 72.06 0 0 1 190.92 212M128 176a32 32 0 1 0-32-32a32 32 0 0 0 32 32m-56-56a8 8 0 0 0-8-8a24 24 0 1 1 23.24-30a8 8 0 1 0 15.5-4A40 40 0 1 0 37 117.51a67.94 67.94 0 0 0-27.4 21.68a8 8 0 1 0 12.8 9.61A51.6 51.6 0 0 1 64 128a8 8 0 0 0 8-8",
};
```

Di dalam Link, ganti isi `{item.label}` dengan blok lengkap berikut:

```tsx
<span className="flex min-w-0 items-center gap-3">
  {navigationIcons[item.href] ? (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 256 256" className="h-5 w-5 shrink-0 fill-current">
      <path d={navigationIcons[item.href]} />
    </svg>
  ) : null}
  <span>{item.label}</span>
</span>
```

Glass aktif yang sudah diterapkan tetap dipakai. Jangan menambahkan garis merah lagi atau menaruh ikon dalam kotak berwarna. Ketika route baru dikembangkan, ambil ikon dari keluarga yang sama.

## Prasyarat dan pemeriksaan

Pastikan Docker dev berjalan dan migrasi dev tersedia; schema-test yang pernah passed hanya membuktikan database test. Jika dev belum dimigrasikan, gunakan migration versioned yang sudah ada, bukan reset:

```bash
docker compose up -d --wait postgres-dev
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
```

Buka `/inventory` lewat sesi yang memiliki inventory:view. Cek pencarian, pencarian kosong, pagination, Lihat unit, cursor unit, kembali ke unit pertama, serta logout. Periksa lebar HP dan keyboard. Tanpa sesi harus ke login; role tanpa izin ke access-denied. Query invalid seperti page=abc atau item=abc harus menghasilkan pesan reset, bukan error database.

Jika database dev kosong, empty state adalah hasil yang benar. Jangan memasukkan data palsu untuk meniru mockup. Foto belum didukung model/API; sengaja tidak ada gambar rekaan. Readiness bukan borrowability. Ini slice read yang utuh, belum representasi lengkap mockup dengan foto, panel unit individual dan riwayat; pekerjaan tersebut mengikuti setelah hasil owner diperiksa.
