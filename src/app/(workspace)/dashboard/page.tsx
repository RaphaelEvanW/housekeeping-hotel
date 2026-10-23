import { redirect } from "next/navigation";
import Link from "next/link";

import { hasPermission } from "@/lib/permissions";
import { requireActiveUser } from "@/server/require-active-user";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default async function DashboardPage() {
  const user = await requireActiveUser();

  if (!hasPermission(user.roles, "dashboard:view")) {
    redirect("/access-denied");
  }

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-5 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6">
        <WorkspacePageHeading className="max-w-xl">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-ws-primary uppercase">
            Housekeeping · Operasional
          </p>
          <h1 className="font-heading text-2xl leading-9 font-semibold tracking-normal text-ws-strong sm:text-[28px]">
            Pusat Kendali Inventaris & Peminjaman Tamu
          </h1>
          <p className="mt-2 text-xs">Selamat datang, {user.name}</p>
        </WorkspacePageHeading>
        {hasPermission(user.roles, "inventory:view") ? (
          <Link
            href="/inventory"
            className="inline-flex min-h-11 items-center justify-center rounded bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
          >
            Buka inventaris
          </Link>
        ) : null}
      </header>

      <section aria-labelledby="demo-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="demo-heading"
            className="font-heading text-base font-semibold text-ws-strong"
          >
            Ringkasan operasional
          </h2>
          <span className="rounded bg-ws-inset px-3 py-1 text-xs font-semibold text-ws-primary">
            Data demonstrasi
          </span>
        </div>
        <p className="text-xs leading-5">
          Angka di bawah adalah contoh tampilan, belum terhubung ke data
          peminjaman atau okupansi hotel.
        </p>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            {
              label: "Total barang dipinjam",
              value: "42",
              unit: "unit",
              detail: "39 dalam batas waktu",
              color: "text-ws-strong",
            },
            {
              label: "Permintaan baru",
              value: "8",
              unit: "kamar",
              detail: "5 menunggu · 3 pengantaran",
              color: "text-ws-strong",
            },
            {
              label: "Melewati batas waktu",
              value: "3",
              unit: "unit",
              detail: "Contoh tindak lanjut",
              color: "text-ws-danger",
            },
            {
              label: "Okupansi hotel",
              value: "92%",
              unit: "",
              detail: "Simulasi tingkat hunian",
              color: "text-ws-strong",
            },
          ].map((metric) => (
            <article
              key={metric.label}
              className="flex flex-col justify-between gap-6 rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6"
            >
              <div>
                <h3 className="text-[11px] leading-4 font-semibold tracking-wide uppercase">
                  {metric.label}
                </h3>
                <p
                  className={`mt-2 font-heading text-3xl font-semibold tracking-normal tabular-nums sm:text-4xl ${metric.color}`}
                >
                  {metric.value}
                  <span className="ml-1 text-xs font-normal text-ws-text">
                    {metric.unit}
                  </span>
                </p>
              </div>
              <p className="text-xs leading-4">{metric.detail}</p>
            </article>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section
            aria-labelledby="borrowing-summary-heading"
            className="rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6"
          >
            <h3
              id="borrowing-summary-heading"
              className="font-heading text-base font-semibold text-ws-strong"
            >
              Peminjaman & Batas Waktu
            </h3>
            <p className="mt-1 text-xs">Data demonstrasi · 42 unit dipinjam</p>
            <dl className="mt-6 space-y-6">
              <div>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <dt>Dalam batas waktu</dt>
                  <dd className="font-semibold text-ws-strong tabular-nums">
                    39 unit
                  </dd>
                </div>
                <div
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full bg-ws-inset"
                >
                  <div className="h-full w-[92.86%] bg-ws-sidebar" />
                </div>
              </div>
              <div>
                <div className="mb-2 flex justify-between gap-3 text-sm">
                  <dt>Melewati batas waktu</dt>
                  <dd className="font-semibold text-ws-danger tabular-nums">
                    3 unit
                  </dd>
                </div>
                <div
                  aria-hidden="true"
                  className="h-2 overflow-hidden rounded-full bg-ws-inset"
                >
                  <div className="h-full w-[7.14%] bg-ws-danger" />
                </div>
              </div>
            </dl>
          </section>
          <section
            aria-labelledby="request-summary-heading"
            className="rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:p-6"
          >
            <h3
              id="request-summary-heading"
              className="font-heading text-base font-semibold text-ws-strong"
            >
              Permintaan Baru
            </h3>
            <p className="mt-1 text-xs">Data demonstrasi · 8 kamar</p>
            <dl className="mt-5 divide-y divide-ws-divider text-sm">
              <div className="flex justify-between gap-3 py-3">
                <dt>Menunggu</dt>
                <dd className="font-semibold text-ws-primary tabular-nums">
                  5 kamar
                </dd>
              </div>
              <div className="flex justify-between gap-3 py-3">
                <dt>Dalam pengantaran</dt>
                <dd className="font-semibold text-ws-strong tabular-nums">
                  3 kamar
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </section>
    </main>
  );
}
