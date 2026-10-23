import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hasPermission } from "@/lib/permissions";
import { getItemUnits } from "@/server/item-units";
import { listItems } from "@/server/list-items";
import { listItemsInputSchema } from "@/server/list-items-input";
import { requireActiveUser } from "@/server/require-active-user";

import { InventoryView } from "./inventory-view";
import { InventoryDrawer } from "./inventory-drawer";
import { UnitLinkLabel } from "./unit-link-label";
import { CreateItemDialog } from "./create-item-dialog";
import { AddStockButton, StockRegistrationProvider } from "./add-stock-dialog";
import { getStockLocations } from "@/server/stock-locations";
import { EditItemDialog } from "./edit-item-dialog";
import { ItemNameDisclosure } from "@/components/item-name-disclosure";
import { UnitDetailsDialog } from "./unit-details-dialog";
import { RequestItemDeactivationDialog } from "./request-item-deactivation-dialog";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

export const metadata: Metadata = { title: "Inventaris | Housekeeping" };

type SearchParams = Record<string, string | string[] | undefined>;

const selectionSchema = z.object({
  item: z.string().uuid().optional(),
  after: z
    .string()
    .regex(/^[1-9]\d*$/u)
    .transform(Number)
    .pipe(z.number().int().positive().max(2_147_483_647))
    .optional(),
});

const conditionLabels = {
  GOOD: "Baik",
  MINOR_DAMAGE: "Rusak ringan",
  DAMAGED: "Rusak",
  MISSING_PART: "Komponen kurang",
} as const;

const readinessLabels = {
  CLEAR: "Siap",
  ON_HOLD: "Belum siap",
  PENDING_INSPECTION: "Perlu pemeriksaan",
  PENDING_VERIFICATION: "Menunggu verifikasi",
} as const;

const custodyLabels = {
  HOUSEKEEPING: "Housekeeping",
  GUEST: "Tamu",
  ENGINEERING: "Engineering",
  EXTERNAL_VENDOR: "Vendor eksternal",
} as const;

const buttonClass = "ws-button-secondary";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireActiveUser();
  if (!hasPermission(user.roles, "inventory:view")) redirect("/access-denied");

  const raw = await searchParams;
  const query = listItemsInputSchema.safeParse({
    q: raw.q,
    page: raw.page,
    pageSize: "20",
  });
  const selection = selectionSchema.safeParse({
    item: raw.item,
    after: raw.after,
  });

  if (
    !query.success ||
    !selection.success ||
    (selection.data.after && !selection.data.item)
  ) {
    return (
      <main className="p-4 md:p-6">
        <WorkspacePageHeading>
          <h1 className="text-2xl font-semibold text-ws-strong">Inventaris</h1>
        </WorkspacePageHeading>
        <p role="alert" className="mt-4 text-sm text-ws-danger">
          Parameter pencarian atau pilihan barang tidak valid.
        </p>
        <Link href="/inventory" className={`${buttonClass} mt-4`}>
          Reset tampilan
        </Link>
      </main>
    );
  }

  const { q, page } = query.data;
  const { item: selectedId, after } = selection.data;
  const [result, selected, stockLocations] = await Promise.all([
    listItems(query.data),
    selectedId ? getItemUnits(selectedId, after) : Promise.resolve(null),
    hasPermission(user.roles, "inventory:stock:add")
      ? getStockLocations()
      : Promise.resolve([]),
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
    <StockRegistrationProvider
      enabled={hasPermission(user.roles, "inventory:stock:add")}
      locations={stockLocations}
    >
      <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8 min-[1440px]:has-[#inventory-unit-panel[open]]:mr-[440px]">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <WorkspacePageHeading className="flex-1 basis-80">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-ws-primary uppercase">
              Divisi Housekeeping
            </p>
            <h1 className="font-heading text-2xl leading-9 font-semibold tracking-normal text-ws-strong sm:text-[28px]">
              Katalog & Ketersediaan Aset
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6">
              List barang dibawah merupakan list barang yang tersedia, 1 jenis
              barang dapat memiliki banyak unit.
            </p>
          </WorkspacePageHeading>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/deactivation-requests" className="inline-flex min-h-11 items-center justify-center rounded-md border border-ws-sidebar bg-ws-sidebar px-3 text-sm leading-5 font-medium tracking-[0.01em] text-white transition-colors duration-150 hover:bg-ws-sidebar/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary motion-reduce:transition-none">
              Pengajuan penonaktifan
            </Link>
            {hasPermission(user.roles, "inventory:item:create") ? (
              <CreateItemDialog />
            ) : null}
          </div>
        </header>

        <section aria-labelledby="item-list-heading" className="@container">
          <div className="mb-4 flex flex-col gap-4 rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="item-list-heading"
                className="font-heading font-semibold text-ws-strong"
              >
                Jenis barang
              </h2>
              <p className="mt-1 text-xs tabular-nums">
                {result.pagination.total} hasil{q ? ` untuk “${q}”` : ""}
              </p>
            </div>
            <form
              action="/inventory"
              method="get"
              className="flex w-full gap-2 sm:max-w-md"
            >
              <label htmlFor="item-search" className="sr-only">
                Cari nama barang
              </label>
              <input
                key={q}
                id="item-search"
                name="q"
                defaultValue={q}
                maxLength={100}
                placeholder="Cari nama barang"
                className="min-h-11 min-w-0 flex-1 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong placeholder:text-ws-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
              />
              <button type="submit" className={buttonClass}>
                Cari
              </button>
            </form>
          </div>

          {result.items.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <h3 className="font-medium text-ws-strong">
                {q ? "Barang tidak ditemukan" : "Belum ada jenis barang"}
              </h3>
              <p className="mt-2 text-sm">
                {q
                  ? "Coba nama lain atau hapus pencarian."
                  : "Jenis barang yang didaftarkan akan tampil di sini."}
              </p>
              {q ? (
                <Link href="/inventory" className={`${buttonClass} mt-4`}>
                  Hapus pencarian
                </Link>
              ) : null}
            </div>
          ) : (
            <InventoryView
              cards={
                <ul
                  aria-label="Katalog jenis barang"
                  className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,264px),264px))] items-start justify-center gap-4"
                >
                  {result.items.map((item) => (
                    <li
                      key={item.id}
                      className={`flex min-w-0 flex-col overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${selectedId === item.id ? "ring-2 ring-ws-primary" : ""}`}
                    >
                      <div className="relative flex h-36 items-center justify-center bg-ws-inset">
                        {item.photoUrl ? (
                          <Image
                            src={item.photoUrl}
                            alt={item.name}
                            fill
                            unoptimized
                            sizes="264px"
                            className="object-contain p-2"
                          />
                        ) : (
                          <span className="text-xs text-ws-text">
                            Foto belum tersedia
                          </span>
                        )}
                        <span
                          className={`absolute top-3 right-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold ${item.isActive ? "text-ws-success" : "text-ws-text"}`}
                        >
                          {item.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex h-10 items-center">
                          <h3
                            title={item.name}
                            className="line-clamp-2 break-words font-heading text-[15px] leading-5 font-medium tracking-normal text-ws-strong"
                          >
                            {item.name}
                          </h3>
                        </div>
                        <dl className="mt-3 mb-4 rounded bg-ws-inset p-2 text-xs leading-5">
                          <div className="flex flex-wrap justify-between gap-x-3">
                            <dt>Diperbarui</dt>
                            <dd className="font-medium text-ws-strong tabular-nums">
                              {dateFormat.format(item.updatedAt)}
                            </dd>
                          </div>
                        </dl>
                        <div className="mt-auto flex items-center gap-2">
                          <Link
                            href={href({ item: item.id })}
                            scroll={false}
                            aria-label={`Detail barang ${item.name}`}
                            aria-current={
                              selectedId === item.id ? "true" : undefined
                            }
                            className={`${buttonClass} min-w-0 flex-1`}
                          >
                            <UnitLinkLabel />
                          </Link>
                          {item.isActive &&
                          hasPermission(user.roles, "inventory:stock:add") ? (
                            <AddStockButton
                              item={{ id: item.id, name: item.name }}
                            />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              }
              table={
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">Daftar jenis barang</caption>
                  <thead className="text-xs text-ws-text">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium md:px-5">
                        Nama barang
                      </th>
                      <th
                        scope="col"
                        className="hidden w-28 px-4 py-3 font-medium md:table-cell"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="hidden w-40 px-4 py-3 font-medium lg:table-cell"
                      >
                        Diperbarui
                      </th>
                      <th
                        scope="col"
                        className="w-40 px-2 py-3 text-right font-medium sm:w-52 sm:px-4 md:px-5"
                      >
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-t border-ws-divider ${selectedId === item.id ? "bg-ws-inset" : "hover:bg-ws-inset/40"}`}
                      >
                        <th
                          scope="row"
                          className="px-4 py-3 font-medium text-ws-strong md:px-5"
                        >
                          <span className="block break-words">{item.name}</span>
                          <span className="mt-1 block text-xs font-normal text-ws-text md:hidden">
                            {item.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                          <span className="mt-1 block text-xs font-normal text-ws-text lg:hidden">
                            Diperbarui {dateFormat.format(item.updatedAt)}
                          </span>
                        </th>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <span
                            className={`inline-flex items-center gap-2 ${item.isActive ? "text-ws-success" : "text-ws-text"}`}
                          >
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 rounded-full bg-current"
                            />
                            {item.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-ws-text tabular-nums lg:table-cell">
                          {dateFormat.format(item.updatedAt)}
                        </td>
                        <td className="px-2 py-3 text-right sm:px-4 md:px-5">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={href({ item: item.id })}
                              scroll={false}
                              aria-label={`Detail barang ${item.name}`}
                              aria-current={
                                selectedId === item.id ? "true" : undefined
                              }
                              className={`${buttonClass} min-h-9! shrink-0 px-2.5! text-xs! whitespace-nowrap`}
                            >
                              <UnitLinkLabel />
                            </Link>
                            {item.isActive &&
                            hasPermission(user.roles, "inventory:stock:add") ? (
                              <AddStockButton
                                item={{ id: item.id, name: item.name }}
                                compact
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            />
          )}

          <nav
            aria-label="Halaman jenis barang"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 py-2"
          >
            <p className="text-xs tabular-nums">
              Menampilkan {start}–{end} dari {result.pagination.total} jenis
              barang
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className={buttonClass}>
                  Sebelumnya
                </Link>
              ) : (
                <button
                  disabled
                  className={`${buttonClass} cursor-not-allowed opacity-50`}
                >
                  Sebelumnya
                </button>
              )}
              <span
                aria-current="page"
                className="px-2 text-sm text-ws-strong tabular-nums"
              >
                {page}
              </span>
              {result.pagination.hasNextPage ? (
                <Link href={href({ page: page + 1 })} className={buttonClass}>
                  Berikutnya
                </Link>
              ) : (
                <button
                  disabled
                  className={`${buttonClass} cursor-not-allowed opacity-50`}
                >
                  Berikutnya
                </button>
              )}
            </div>
          </nav>
        </section>

        {selectedId ? (
          <InventoryDrawer key={selectedId} closeHref={href({})} footer={selected ? (
            <section aria-label="Pengelolaan jenis barang">
              <Link
                href={`/inventory/deactivation-requests?${new URLSearchParams({ itemId: selected.item.id, status: "ALL" })}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-md text-sm text-ws-strong hover:text-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
              >
                <span>Riwayat pengajuan</span>
                <WorkspaceControlIcon name="caretRight" />
              </Link>
              {selected.item.isActive && hasPermission(user.roles, "inventory:item:deactivation:request") ? (
                <div className="mt-3 flex justify-end">
                  <RequestItemDeactivationDialog key={selected.item.id} item={{ id: selected.item.id, name: selected.item.name }} actorId={user.id} />
                </div>
              ) : null}
            </section>
          ) : null}>
            <div className="min-w-0 max-w-full">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <ItemNameDisclosure
                    id="units-heading"
                    name={selected ? selected.item.name : "Barang tidak ditemukan"}
                  />
                </div>
                {selected && hasPermission(user.roles, "inventory:item:update") ? (
                  <div className="shrink-0">
                    <EditItemDialog
                      key={selected.item.id}
                      item={{ id: selected.item.id, name: selected.item.name, description: selected.item.description }}
                    />
                  </div>
                ) : null}
              </div>
              {selected?.item.photoUrl ? (
                <Image
                  src={selected.item.photoUrl}
                  alt={selected.item.name}
                  width={160}
                  height={144}
                  unoptimized
                  className="mt-4 h-36 w-full rounded-md bg-ws-inset object-contain p-2"
                />
              ) : null}
              {selected?.item.description ? (
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                  {selected.item.description}
                </p>
              ) : null}
              {selected ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ws-divider pt-4">
                  <div>
                    <p className="text-xs">Unit fisik terdaftar</p>
                    <p className="mt-1 text-2xl font-semibold leading-8 text-ws-strong tabular-nums">{selected.totalRegistered}</p>
                  </div>
                  {selected.item.isActive && hasPermission(user.roles, "inventory:stock:add") ? (
                    <div className="w-40 max-w-full shrink-0">
                      <AddStockButton labelled item={{ id: selected.item.id, name: selected.item.name }} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {!selected ? (
                <p className="mt-2 text-xs leading-5">
                  Pilihan barang ini sudah tidak tersedia.
                </p>
              ) : null}
            </div>
            {selected ? (
              <div className="mt-5">
                <div role="region" aria-label="Daftar unit fisik" tabIndex={0} className="max-h-[40svh] overflow-y-auto overscroll-contain rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">
                <table className="w-full table-fixed text-left text-xs">
                  <caption className="sr-only">
                    Unit fisik barang terpilih
                  </caption>
                  <thead className="sticky top-0 z-10 border-b border-ws-divider bg-white text-ws-text">
                    <tr>
                      <th scope="col" className="w-8 py-3 pr-2 font-medium">
                        No.
                      </th>
                      <th scope="col" className="w-[44%] py-3 pr-3 font-medium">
                        Unit fisik
                      </th>
                      <th scope="col" className="py-3 font-medium">
                        Detail & status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ws-divider">
                    {selected.units.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-sm">
                          {after
                            ? "Tidak ada unit setelah halaman ini."
                            : "Belum ada unit fisik untuk jenis barang ini."}
                        </td>
                      </tr>
                    ) : null}
                    {selected.units.map((unit, index) => (
                      <tr
                        key={unit.id}
                        className="align-top [overflow-wrap:anywhere]"
                      >
                        <td className="py-3 pr-2 align-top leading-5 text-ws-text tabular-nums">
                          {index + 1}
                        </td>
                        <th scope="row" className="py-3 pr-3 align-top leading-5 font-normal">
                          <UnitDetailsDialog
                            itemName={selected.item.name}
                            canEdit={hasPermission(
                              user.roles,
                              "inventory:unit:update",
                            )}
                            unit={{
                              id: unit.id,
                              itemId: selected.item.id,
                              unitCode: unit.unitCode,
                              name: null,
                              serialNumber: unit.serialNumber,
                              notes: unit.notes,
                              createdAt: unit.createdAt.toISOString(),
                              updatedAt: unit.updatedAt.toISOString(),
                              facts: [
                                {
                                  label: "Kondisi unit",
                                  value: conditionLabels[unit.condition],
                                },
                                {
                                  label: "Kesiapan",
                                  value: readinessLabels[unit.readiness],
                                },
                                {
                                  label: "Penguasaan",
                                  value: custodyLabels[unit.custody],
                                },
                                {
                                  label: "Lokasi",
                                  value: unit.location?.name ?? "Belum dicatat",
                                },
                                {
                                  label: "Siklus unit",
                                  value:
                                    unit.lifecycle === "ACTIVE"
                                      ? "Aktif"
                                      : "Dipensiunkan",
                                },
                                {
                                  label: "Status kehilangan",
                                  value:
                                    unit.lossState === "NONE"
                                      ? "Tidak ada laporan"
                                      : unit.lossState === "LOST"
                                        ? "Hilang"
                                        : "Belum ditemukan",
                                },
                              ],
                            }}
                          />
                        </th>
                        <td className="py-3 align-top leading-5">
                          <p className="font-medium text-ws-strong">
                            Kondisi: {conditionLabels[unit.condition]}
                          </p>
                          <p
                            className={`mt-1 text-xs ${unit.readiness === "CLEAR" ? "text-ws-text" : "text-ws-warning"}`}
                          >
                            Kesiapan: {readinessLabels[unit.readiness]}
                          </p>
                          {unit.lossState !== "NONE" ? (
                            <p className="mt-1 text-xs text-ws-danger">
                              {unit.lossState === "LOST"
                                ? "Hilang"
                                : "Belum ditemukan"}
                            </p>
                          ) : null}
                          <p className="mt-1 break-words">
                            Lokasi: {unit.location?.name ?? "Belum dicatat"}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {after ? (
                    <Link
                      href={href({ item: selectedId })}
                      scroll={false}
                      className={buttonClass}
                    >
                      Kembali ke unit pertama
                    </Link>
                  ) : null}
                  {selected.nextCursor ? (
                    <Link
                      href={href({
                        item: selectedId,
                        after: selected.nextCursor,
                      })}
                      scroll={false}
                      className={buttonClass}
                    >
                      Unit berikutnya
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </InventoryDrawer>
        ) : null}
      </main>
    </StockRegistrationProvider>
  );
}
