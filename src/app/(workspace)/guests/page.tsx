import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { PaginationChevron } from "@/components/pagination-chevron";
import { hasPermission } from "@/lib/permissions";
import { listGuestVisitsInputSchema } from "@/server/list-guest-visits-input";
import { listGuestVisits } from "@/server/list-guest-visits";
import { requireActiveUser } from "@/server/require-active-user";
import { RegisterGuestDialog } from "./register-guest-dialog";
import { StatusFilter } from "./status-filter";

export const metadata: Metadata = { title: "Tamu | Housekeeping" };

type SearchParams = Record<string, string | string[] | undefined>;
const path = "/guests";
const statusLabels = {
  STAYING: "Menginap",
  CHECKED_OUT: "Sudah checkout",
  ALL: "Semua status",
} as const;
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireActiveUser();
  if (!hasPermission(user.roles, "guests:view")) redirect("/access-denied");

  const raw = await searchParams;
  const parsed = listGuestVisitsInputSchema.safeParse({
    page: raw.page,
    pageSize: "10",
    q: raw.q,
    status: raw.status,
  });

  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-[1440px] p-4 md:p-6 lg:p-8">
        <WorkspacePageHeading>
          <h1 className="font-heading text-2xl font-semibold text-ws-strong">
            Daftar tamu
          </h1>
        </WorkspacePageHeading>
        <p role="alert" className="mt-4 text-sm text-ws-danger">
          Parameter pencarian atau filter tamu tidak valid.
        </p>
        <Link href={path} className="ws-button-secondary mt-4">
          Reset filter
        </Link>
      </main>
    );
  }

  const { page, q, status } = parsed.data;
  const result = await listGuestVisits({
    page: String(page),
    pageSize: "10",
    q,
    status,
  });
  if (page > Math.max(1, result.pagination.totalPages)) {
    redirect(
      `${path}?${new URLSearchParams({ status, ...(q ? { q } : {}), page: "1" })}`,
    );
  }

  function href(targetPage: number) {
    const params = new URLSearchParams({ status, page: String(targetPage) });
    if (q) params.set("q", q);
    return `${path}?${params}`;
  }

  const { total, totalPages, hasNextPage } = result.pagination;
  const start = total === 0 ? 0 : (page - 1) * 10 + 1;
  const end = Math.min(page * 10, total);

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <WorkspacePageHeading className="flex-1 basis-80">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-ws-primary uppercase">
            Divisi Housekeeping
          </p>
          <h1 className="font-heading text-2xl leading-9 font-semibold text-ws-strong sm:text-[28px]">
            Daftar tamu
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6">
            Catat kunjungan tamu yang akan meminjam barang, lalu pilih tamu yang dituju
            saat membuat peminjaman.
          </p>
        </WorkspacePageHeading>
        {hasPermission(user.roles, "guests:create") ? (
          <RegisterGuestDialog />
        ) : null}
      </header>

      <section
        aria-labelledby="guest-list-heading"
        className="rounded-lg border border-ws-divider bg-ws-surface"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ws-divider p-4 md:p-5">
          <div className="min-w-0">
            <h2
              id="guest-list-heading"
              className="font-heading font-semibold text-ws-strong"
            >
              Kunjungan tamu
            </h2>
            <p className="mt-1 text-xs leading-5 tabular-nums">
              {total} kunjungan · Terbaru lebih dulu
            </p>
          </div>
          <form
            action={path}
            method="get"
            className="flex w-full flex-wrap items-end gap-3 lg:w-auto"
          >
            <label className="min-w-48 flex-1 basis-56 text-xs font-medium text-ws-strong">
              Cari tamu
              <input
                key={q}
                name="q"
                defaultValue={q}
                maxLength={200}
                placeholder="Nama, kamar, atau booking"
                autoComplete="off"
                className="mt-2 min-h-11 w-full rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong placeholder:text-ws-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
              />
            </label>
            <StatusFilter
              key={`status-${status}-${page}`}
              initialValue={status}
              options={Object.entries(statusLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ws-primary bg-ws-primary px-4 text-sm leading-5 font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
            >
              Terapkan
            </button>
            {raw.status !== undefined || raw.q !== undefined ? (
              <Link
                href={path}
                aria-label="Hapus filter"
                title="Hapus filter"
                className="ws-button-secondary size-11 shrink-0 p-0"
              >
                <WorkspaceControlIcon name="close" />
              </Link>
            ) : null}
          </form>
        </div>

        {result.visits.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="text-sm font-medium text-ws-strong">
              {q || status !== "STAYING"
                ? "Tidak ada kunjungan yang sesuai"
                : "Belum ada tamu yang terdaftar"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6">
              {q || status !== "STAYING"
                ? "Ubah pencarian atau status untuk melihat kunjungan lain."
                : "Daftarkan tamu yang akan meminjam barang."}
            </p>
          </div>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1.2fr)_minmax(110px,0.55fr)_minmax(190px,0.9fr)_minmax(110px,0.45fr)] gap-5 border-b border-ws-divider px-5 py-3 text-xs text-ws-text md:grid"
            >
              <span>Tamu & booking</span>
              <span>Kamar</span>
              <span>Menginap</span>
              <span>Status</span>
            </div>
            <ul
              aria-label="Daftar kunjungan tamu"
              className="divide-y divide-ws-divider"
            >
              {result.visits.map((visit) => (
                <li
                  key={visit.id}
                  className="grid min-w-0 gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(110px,0.55fr)_minmax(190px,0.9fr)_minmax(110px,0.45fr)] md:items-center md:gap-5 md:px-5"
                >
                  <div className="min-w-0">
                    <Link href={`/guests/${visit.id}`} className="inline-flex min-h-11 items-center break-words rounded text-sm font-medium text-ws-strong underline decoration-ws-divider underline-offset-4 hover:text-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">
                      {visit.primaryGuestName}
                    </Link>
                    <p className="mt-1 break-all text-xs leading-5">
                      {visit.bookingNumber
                        ? `Booking ${visit.bookingNumber}`
                        : "Nomor booking tidak tersedia"}
                    </p>
                    {visit.isDuplicate ? (
                      <span className="mt-2 inline-flex rounded bg-ws-warning/10 px-2 py-1 text-xs font-medium text-ws-warning">
                        Registrasi duplikat
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm">
                    <span className="mb-1 block text-xs text-ws-text md:hidden">
                      Kamar
                    </span>
                    {visit.roomNumber}
                  </p>
                  <p className="text-sm tabular-nums">
                    <span className="mb-1 block text-xs text-ws-text md:hidden">
                      Menginap
                    </span>
                    {dateFormat.format(visit.checkInDate)} –{" "}
                    {dateFormat.format(visit.plannedCheckoutDate)}
                  </p>
                  <div>
                    <span className="mb-1 block text-xs text-ws-text md:hidden">
                      Status
                    </span>
                    <span
                      className={`inline-flex rounded px-2 py-1 text-xs font-medium ${visit.status === "STAYING" ? "bg-ws-success/10 text-ws-success" : "bg-ws-inset text-ws-text"}`}
                    >
                      {visit.status === "STAYING"
                        ? "Menginap"
                        : "Sudah checkout"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 text-xs">
        <p className="tabular-nums">
          Menampilkan {start}–{end} dari {total} kunjungan
        </p>
        <nav
          aria-label="Halaman daftar tamu"
          className="flex items-center gap-3"
        >
          {page <= 1 ? (
            <button
              type="button"
              aria-label="Halaman sebelumnya"
              disabled
              className="ws-button-secondary size-11 cursor-not-allowed p-0 opacity-50"
            >
              <PaginationChevron direction="previous" />
            </button>
          ) : (
            <Link
              aria-label="Halaman sebelumnya"
              href={href(page - 1)}
              className="ws-button-secondary size-11 p-0"
            >
              <PaginationChevron direction="previous" />
            </Link>
          )}
          <span className="tabular-nums">
            {page} / {Math.max(totalPages, 1)}
          </span>
          {!hasNextPage ? (
            <button
              type="button"
              aria-label="Halaman berikutnya"
              disabled
              className="ws-button-secondary size-11 cursor-not-allowed p-0 opacity-50"
            >
              <PaginationChevron direction="next" />
            </button>
          ) : (
            <Link
              aria-label="Halaman berikutnya"
              href={href(page + 1)}
              className="ws-button-secondary size-11 p-0"
            >
              <PaginationChevron direction="next" />
            </Link>
          )}
        </nav>
      </footer>
    </main>
  );
}
