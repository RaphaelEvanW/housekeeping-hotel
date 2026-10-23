import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/permissions";
import { listItemDeactivationsInputSchema } from "@/server/item-deactivation-input";
import { listItemDeactivationRequests } from "@/server/list-item-deactivation";
import { requireActiveUser } from "@/server/require-active-user";
import { DeactivationRequestActions } from "./request-actions";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { getItemUnits } from "@/server/item-units";
import { ItemFilter } from "./item-filter";
import { StatusFilter } from "./status-filter";
import { PaginationChevron } from "@/components/pagination-chevron";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

export const metadata: Metadata = { title: "Pengajuan penonaktifan | Housekeeping" };

const path = "/inventory/deactivation-requests";
const statusLabels = {
  PENDING: "Menunggu keputusan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  ALL: "Semua status",
} as const;
const statusStyles = {
  PENDING: "bg-ws-warning/10 text-ws-warning",
  APPROVED: "bg-ws-success/10 text-ws-success",
  REJECTED: "bg-ws-danger/10 text-ws-danger",
  CANCELLED: "bg-ws-inset text-ws-text",
} as const;
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});
type SearchParams = Record<string, string | string[] | undefined>;

export default async function DeactivationPage({ searchParams }: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireActiveUser();
  if (!hasPermission(user.roles, "inventory:view")) redirect("/access-denied");

  const raw = await searchParams;
  const parsed = listItemDeactivationsInputSchema.safeParse({
    page: raw.page, pageSize: "10", status: raw.status, itemId: raw.itemId,
  });

  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-[1440px] p-4 md:p-6 lg:p-8">
        <WorkspacePageHeading fallbackHref="/inventory">
          <h1 className="text-2xl font-semibold text-ws-strong">Pengajuan penonaktifan</h1>
        </WorkspacePageHeading>
        <p role="alert" className="mt-4 text-sm text-ws-danger">Filter atau halaman pengajuan tidak valid.</p>
        <Link href={path} className="ws-button-secondary mt-4">Reset filter</Link>
      </main>
    );
  }

  const { page, status, itemId } = parsed.data;
  const [result, selectedItem] = await Promise.all([
    listItemDeactivationRequests({
      page: String(page), pageSize: "10", status,
      ...(itemId ? { itemId } : {}),
    }),
    itemId ? getItemUnits(itemId) : Promise.resolve(null),
  ]);

  function href(targetPage: number, includeItem = true) {
    const query = new URLSearchParams({ status, page: String(targetPage) });
    if (includeItem && itemId) query.set("itemId", itemId);
    return `${path}?${query}`;
  }

  if (page > Math.max(1, result.pagination.totalPages)) redirect(href(1));

  const { total, totalPages, hasNextPage } = result.pagination;
  const start = total === 0 ? 0 : (page - 1) * 10 + 1;
  const end = Math.min(page * 10, total);

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <WorkspacePageHeading fallbackHref={itemId ? `/inventory?${new URLSearchParams({ item: itemId })}` : "/inventory"} className="flex-1 basis-80">
          <h1 className="font-heading text-2xl leading-9 font-semibold tracking-normal text-ws-strong sm:text-[28px]">
            Pengajuan penonaktifan
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6">
            Pantau pengajuan jenis barang, alasan, dan keputusan yang tercatat.
          </p>
        </WorkspacePageHeading>
      </header>

      <section aria-labelledby="deactivation-list-heading" className="rounded-lg border border-ws-divider bg-ws-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ws-divider p-4 md:p-5">
          <div className="min-w-0">
            <h2 id="deactivation-list-heading" className="font-medium text-ws-strong">Daftar pengajuan</h2>
            <p className="mt-1 text-xs leading-5 tabular-nums">{total} pengajuan · Terbaru lebih dulu</p>
            {itemId ? (
              <p className="mt-2 text-xs leading-5">
                Jenis barang: {selectedItem?.item.name ?? "Tidak ditemukan"}.
                <Link href={href(1, false)} className="ml-2 inline-flex min-h-11 items-center rounded text-ws-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">
                  Semua jenis barang
                </Link>
              </p>
            ) : null}
          </div>
          <form action={path} method="get" className="flex w-full flex-wrap items-end gap-3 lg:w-auto lg:max-w-full">
            <ItemFilter
              key={`item-${itemId ?? "ALL"}-${status}-${page}`}
              initialItem={itemId ? { id: itemId, name: selectedItem?.item.name ?? "Jenis barang tidak ditemukan" } : null}
            />
            <StatusFilter key={`status-${itemId ?? "ALL"}-${status}-${page}`} initialValue={status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} />
            <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white transition-colors duration-150 hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary motion-reduce:transition-none">Terapkan</button>
            {raw.status !== undefined || itemId ? (
              <Link href={path} aria-label="Hapus filter" title="Hapus filter" className="ws-button-secondary size-11 shrink-0 p-0">
                <WorkspaceControlIcon name="close" />
              </Link>
            ) : null}
          </form>
        </div>

        {result.deactivationRequests.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="text-sm font-medium text-ws-strong">Belum ada pengajuan yang sesuai</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6">Coba status lain. Pengajuan baru dibuat dari detail jenis barang di inventaris.</p>
          </div>
        ) : (
          <>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(140px,0.65fr)_minmax(160px,0.65fr)] gap-5 border-b border-ws-divider px-5 py-3 text-xs text-ws-text md:grid">
              <span>Jenis barang & alasan</span><span>Pengaju & waktu</span><span>Status & keputusan</span>
            </div>
            <ul aria-label="Pengajuan penonaktifan jenis barang" className="divide-y divide-ws-divider">
              {result.deactivationRequests.map(request => (
                <li key={request.id} className="grid min-w-0 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(140px,0.65fr)_minmax(160px,0.65fr)] md:gap-5 md:p-5">
                  <div className="min-w-0">
                    <Link
                      href={`/inventory?${new URLSearchParams({ item: request.item.id })}`}
                      className="inline-flex min-h-11 max-w-full items-center rounded text-sm font-medium text-ws-strong underline decoration-ws-sidebar/20 underline-offset-4 [overflow-wrap:anywhere] hover:text-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
                    >
                      {request.item.name}
                    </Link>
                    <details className="mt-1">
                      <summary className="w-fit cursor-pointer rounded py-2 text-xs text-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">Alasan pengajuan</summary>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{request.reason}</p>
                    </details>
                  </div>
                  <div className="min-w-0 text-xs leading-5 [overflow-wrap:anywhere]">
                    <p className="mb-1 text-ws-text md:sr-only">Pengaju & waktu</p>
                    <p className="text-sm text-ws-strong">{request.requestedBy.name}</p>
                    <time dateTime={request.createdAt.toISOString()} className="mt-1 block tabular-nums">{dateFormat.format(request.createdAt)} WIB</time>
                  </div>
                  <div className="min-w-0 text-xs leading-5 [overflow-wrap:anywhere]">
                    <span className={`inline-flex rounded px-2 py-1 font-medium ${statusStyles[request.status]}`}>{statusLabels[request.status]}</span>
                    {request.status === "PENDING" ? <p className="mt-2">Belum ada keputusan.</p> : (
                      <>
                        <p className="mt-2">Diproses oleh {request.decidedBy?.name ?? "—"}</p>
                        {request.decidedAt ? <time dateTime={request.decidedAt.toISOString()} className="mt-1 block tabular-nums">{dateFormat.format(request.decidedAt)} WIB</time> : null}
                      </>
                    )}
                    {request.status === "PENDING" && (
                      hasPermission(user.roles, "inventory:item:deactivation:decide") ||
                      (request.requestedBy.id === user.id && hasPermission(user.roles, "inventory:item:deactivation:cancel"))
                    ) ? (
                      <DeactivationRequestActions
                        request={{
                          id: request.id,
                          itemId: request.item.id,
                          itemName: request.item.name,
                          reason: request.reason,
                          requestedBy: request.requestedBy.name,
                          createdAt: request.createdAt.toISOString(),
                        }}
                        actorId={user.id}
                        canDecide={hasPermission(user.roles, "inventory:item:deactivation:decide")}
                        canCancel={request.requestedBy.id === user.id && hasPermission(user.roles, "inventory:item:deactivation:cancel")}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <nav aria-label="Halaman pengajuan penonaktifan" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 tabular-nums">Menampilkan {start}–{end} dari {total} pengajuan</p>
        <div className="grid grid-cols-[44px_minmax(48px,auto)_44px] items-center gap-2">
          {page > 1 ? <Link href={href(page - 1)} aria-label="Pengajuan sebelumnya" title="Sebelumnya" className="ws-button-secondary size-11 p-0"><PaginationChevron direction="previous" /></Link> : <button type="button" aria-label="Pengajuan sebelumnya" title="Sebelumnya" disabled className="ws-button-secondary size-11 p-0"><PaginationChevron direction="previous" /></button>}
          <span aria-current="page" className="text-center text-sm tabular-nums">{page} / {Math.max(1, totalPages)}</span>
          {hasNextPage && page < 1000 ? <Link href={href(page + 1)} aria-label="Pengajuan berikutnya" title="Berikutnya" className="ws-button-secondary size-11 p-0"><PaginationChevron direction="next" /></Link> : <button type="button" aria-label="Pengajuan berikutnya" title="Berikutnya" disabled className="ws-button-secondary size-11 p-0"><PaginationChevron direction="next" /></button>}
        </div>
      </nav>
      {page === 1000 && hasNextPage ? <p className="text-xs leading-5">Batas 1000 halaman tercapai. Gunakan filter status atau jenis barang untuk mempersempit daftar.</p> : null}
    </main>
  );
}
