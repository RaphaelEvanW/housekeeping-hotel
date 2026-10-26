import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { PaginationChevron } from "@/components/pagination-chevron";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { hasPermission } from "@/lib/permissions";
import { unitDisplayName } from "@/lib/unit-display-name";
import { requireActiveUser } from "@/server/require-active-user";
import { guestVisitIdSchema } from "@/server/guest-visit-input";
import { listGuestBorrowings } from "@/server/list-guest-borrowings";
import { listGuestBorrowingsInputSchema } from "@/server/list-guest-borrowings-input";
import { StatusFilter } from "../status-filter";
import { IssueBorrowingDialog } from "../issue-borrowing-dialog";
import { UnitHistoryPhoto } from "../../inventory/unit-history-photo";

export const metadata: Metadata = { title: "Detail tamu | Housekeeping" };
const statusLabels = { ALL: "Semua pinjaman", OUTSTANDING: "Masih dipinjam", RETURNED: "Dikembalikan", SETTLED: "Diselesaikan" } as const;
const conditionLabels = { GOOD: "Baik", MINOR_DAMAGE: "Rusak ringan", DAMAGED: "Rusak", MISSING_PART: "Komponen kurang" };
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });
const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function GuestDetailPage({ params, searchParams }: {
  params: Promise<{ visitId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireActiveUser();
  if (!hasPermission(user.roles, "guests:view") || !hasPermission(user.roles, "borrowing:view")) redirect("/access-denied");
  const { visitId } = await params;
  if (!guestVisitIdSchema.safeParse(visitId).success) notFound();
  const path = `/guests/${visitId}`;
  const raw = await searchParams;
  const parsed = listGuestBorrowingsInputSchema.safeParse({ visitId, page: raw.page, pageSize: "10", status: raw.status });
  if (!parsed.success) return <main className="mx-auto max-w-[1440px] space-y-4 p-4 md:p-6 lg:p-8"><WorkspacePageHeading fallbackHref="/guests"><h1 className="text-2xl font-semibold text-ws-strong">Detail tamu</h1></WorkspacePageHeading><p role="alert" className="text-sm text-ws-danger">Parameter halaman atau status pinjaman tidak valid.</p><Link href={path} className="ws-button-secondary">Reset filter</Link></main>;
  const result = await listGuestBorrowings({ visitId, page: String(parsed.data.page), pageSize: "10", status: parsed.data.status });
  if (!result) notFound();
  const { visit, summary, lines, pagination } = result;
  const { page, status } = parsed.data;
  const href = (target: number) => `${path}?${new URLSearchParams({ status, page: String(target) })}`;
  if (page > Math.max(1, pagination.totalPages)) redirect(href(1));

  return <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <WorkspacePageHeading fallbackHref="/guests" className="flex-1 basis-80">
        <p className="mb-2 text-xs text-ws-text">Detail tamu · {visit.status === "STAYING" ? "Menginap" : "Sudah checkout"}</p>
        <h1 className="break-words font-heading text-2xl font-semibold text-ws-strong">{visit.primaryGuestName}</h1>
        <p className="mt-2 break-words text-sm">Kamar {visit.roomNumber} · Booking {visit.bookingNumber ?? "tidak tersedia"}</p>
        <p className="mt-1 text-xs leading-5 tabular-nums">{date.format(visit.checkInDate)} – {date.format(visit.plannedCheckoutDate)}</p>
        {visit.isDuplicate ? <p className="mt-2 text-xs text-ws-warning">Registrasi duplikat</p> : null}
      </WorkspacePageHeading>
      {visit.status === "STAYING" && hasPermission(user.roles, "borrowing:create") ? <IssueBorrowingDialog visit={{ id: visit.id, primaryGuestName: visit.primaryGuestName, roomNumber: visit.roomNumber }} /> : null}
    </header>
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-ws-divider py-5 sm:grid-cols-4">
      {[{ label: "Masih dipinjam", value: summary.outstandingLines }, { label: "Dikembalikan", value: summary.returnedLines }, { label: "Diselesaikan", value: summary.settledLines }, { label: "Kali peminjaman", value: summary.totalOccasions }].map(fact => <div key={fact.label}><dt className="text-xs">{fact.label}</dt><dd className="mt-1 text-2xl font-semibold text-ws-strong tabular-nums">{fact.value}</dd></div>)}
    </dl>
    <section aria-labelledby="visit-borrowings-heading" className="rounded-lg border border-ws-divider bg-ws-surface">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ws-divider p-4 md:p-5">
        <div><h2 id="visit-borrowings-heading" className="font-semibold text-ws-strong">Pinjaman & riwayat</h2><p className="mt-1 text-xs">{pagination.total} unit · Terbaru lebih dulu</p></div>
        <form action={path} method="get" className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <StatusFilter key={`borrowing-${status}-${page}`} initialValue={status} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} label="Status pinjaman" />
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm font-medium text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">Terapkan</button>
          {raw.status !== undefined ? <Link href={path} aria-label="Hapus filter pinjaman" className="ws-button-secondary size-11 p-0"><WorkspaceControlIcon name="close" /></Link> : null}
        </form>
      </div>
      {lines.length === 0 ? <div className="px-5 py-12 text-center"><h3 className="text-sm font-medium text-ws-strong">{summary.totalLines === 0 ? "Belum ada peminjaman" : "Tidak ada pinjaman yang sesuai"}</h3><p className="mt-2 text-sm leading-6">{summary.totalLines === 0 ? "Peminjaman tamu ini akan tercatat di sini." : "Pilih status lain untuk melihat riwayat unit."}</p></div> : <ol className="divide-y divide-ws-divider">{lines.map((line, index) => <li key={line.id} className="p-4 md:p-5">
        <div className="flex items-start gap-3"><span className="w-6 shrink-0 text-xs leading-5 tabular-nums">{(page - 1) * 10 + index + 1}.</span><div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-ws-strong">{unitDisplayName(line.unit)}</h3><p className="mt-1 break-words text-xs">{line.unit.item.name} · {line.unit.unitCode}</p></div><span className={`shrink-0 rounded px-2 py-1 text-xs ${line.status === "OUTSTANDING" ? "bg-ws-warning/10 text-ws-warning" : "bg-ws-inset text-ws-strong"}`}>{statusLabels[line.status]}</span></div>
          <p className="mt-3 text-xs leading-5">Dipinjamkan {time.format(line.borrowing.issuedAt)} WIB · {line.borrowing.issuedBy.name}</p>
          <details className="mt-3 group"><summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-xs text-ws-strong focus-visible:outline-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden">Detail & foto<span className="rotate-90 group-open:-rotate-90"><WorkspaceControlIcon name="caretRight" /></span></summary>
            <dl className="grid gap-x-6 gap-y-3 py-3 text-xs sm:grid-cols-2"><div><dt>Tamu saat peminjaman</dt><dd className="mt-1 break-words text-ws-strong">{line.borrowing.primaryGuestNameSnapshot}</dd></div><div><dt>Kamar saat peminjaman</dt><dd className="mt-1 text-ws-strong">{line.borrowing.roomNumberSnapshot}</dd></div><div><dt>Kondisi saat dipinjamkan</dt><dd className="mt-1 text-ws-strong">{conditionLabels[line.conditionAtIssue]}</dd></div><div><dt>Nomor seri saat ini</dt><dd className="mt-1 break-words text-ws-strong">{line.unit.serialNumber || "Belum diisi"}</dd></div>{line.resolvedAt ? <div><dt>{line.status === "RETURNED" ? "Dikembalikan" : "Diselesaikan"}</dt><dd className="mt-1 text-ws-strong">{time.format(line.resolvedAt)} WIB</dd></div> : null}</dl>
            <ul aria-label={`Foto peminjaman ${unitDisplayName(line.unit)}`} className="flex flex-wrap gap-3">{line.photos.map((photo, photoIndex) => <UnitHistoryPhoto key={photo.id} url={photo.url} label={`Foto ${photoIndex + 1} · ${time.format(photo.event.createdAt)} WIB`} />)}</ul>
            {line.photos.length === 0 ? <p className="py-2 text-xs">Belum ada foto yang tercatat.</p> : null}
          </details>
        </div></div>
      </li>)}</ol>}
    </section>
    <footer className="flex flex-wrap items-center justify-between gap-4 text-xs"><p className="tabular-nums">Menampilkan {pagination.total ? (page - 1) * 10 + 1 : 0}–{Math.min(page * 10, pagination.total)} dari {pagination.total} unit</p><nav aria-label="Halaman riwayat pinjaman" className="flex items-center gap-3">
      {page <= 1 ? <button disabled aria-label="Pinjaman sebelumnya" className="ws-button-secondary size-11 p-0"><PaginationChevron direction="previous" /></button> : <Link href={href(page - 1)} aria-label="Pinjaman sebelumnya" className="ws-button-secondary size-11 p-0"><PaginationChevron direction="previous" /></Link>}
      <span className="tabular-nums">{page} / {Math.max(1, pagination.totalPages)}</span>
      {!pagination.hasNextPage ? <button disabled aria-label="Pinjaman berikutnya" className="ws-button-secondary size-11 p-0"><PaginationChevron direction="next" /></button> : <Link href={href(page + 1)} aria-label="Pinjaman berikutnya" className="ws-button-secondary size-11 p-0"><PaginationChevron direction="next" /></Link>}
    </nav></footer>
  </main>;
}
