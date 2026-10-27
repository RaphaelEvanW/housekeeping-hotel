"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { UnitHistoryPhoto } from "./unit-history-photo";
import {
  HISTORY_MAX_PAGE,
  HISTORY_PAGE_SIZE,
  historyChanges,
  historyEventDetails,
  historyEventTitle,
  parseUnitHistory,
  type UnitHistoryData,
} from "@/lib/item-unit-history-view";

type HistoryRequest = {
  page: number;
  revision: number;
};

type HistoryResult = {
  request: HistoryRequest;
  unitId: string;
} & (
  | {
      status: "ready";
      data: UnitHistoryData;
    }
  | {
      status: "error";
      message: string;
      expired: boolean;
    }
);

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function responseMessage(status: number) {
  switch (status) {
    case 401:
      return "Sesi Anda berakhir. Masuk kembali untuk melihat riwayat.";
    case 403:
      return "Anda tidak memiliki izin melihat riwayat unit.";
    case 404:
      return "Unit tidak ditemukan. Muat ulang daftar barang.";
    case 400:
      return "Halaman riwayat tidak valid. Muat ulang riwayat.";
    default:
      return "Riwayat belum berhasil dimuat. Coba lagi.";
  }
}

export function UnitHistory({
  unitId,
  unitCode,
  children,
}: {
  unitId: string;
  unitCode: string;
  children?: ReactNode;
}) {
  const [request, setRequest] = useState<HistoryRequest>({
    page: 1,
    revision: 0,
  });
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [preview, setPreview] = useState<{ unitId: string; event: UnitHistoryData["events"][number] } | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const query = new URLSearchParams({
          page: String(request.page),
          pageSize: String(HISTORY_PAGE_SIZE),
        });

        const response = await fetch(
          `/api/item-units/${encodeURIComponent(unitId)}/history?${query}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        if (!response.ok) {
          setResult({
            request,
            unitId,
            status: "error",
            message: responseMessage(response.status),
            expired: response.status === 401,
          });
          return;
        }

        const body: unknown = await response.json();
        const data = parseUnitHistory(body, unitId, unitCode, request.page);

        if (!data) throw new Error("Invalid history response");
        if (controller.signal.aborted) return;

        if (request.page === 1) {
          let initialEvent = data.events.find((event) => event.action === "STOCK_UNIT_CREATED");
          setPhotoError(false);
          try {
            const lastPage = data.pagination.totalPages;
            if (!initialEvent && lastPage > 1) {
              if (lastPage > HISTORY_MAX_PAGE) throw new Error("Initial photos outside history page limit");
              const initialQuery = new URLSearchParams({ page: String(lastPage), pageSize: String(HISTORY_PAGE_SIZE) });
              const initialResponse = await fetch(`/api/item-units/${encodeURIComponent(unitId)}/history?${initialQuery}`, {
                cache: "no-store", credentials: "same-origin", signal: controller.signal,
              });
              if (!initialResponse.ok) throw new Error("Initial photos unavailable");
              const oldest = parseUnitHistory(await initialResponse.json(), unitId, unitCode, lastPage);
              if (!oldest) throw new Error("Invalid initial photo response");
              initialEvent = oldest.events.find((event) => event.action === "STOCK_UNIT_CREATED");
              if (!initialEvent && oldest.pagination.hasNextPage) throw new Error("Initial photo history changed; retry");
            }
            if (controller.signal.aborted) return;
            setPreview(initialEvent ? { unitId, event: initialEvent } : null);
          } catch {
            if (controller.signal.aborted) return;
            setPreview(null);
            setPhotoError(true);
          }
        }

        setResult({
          request,
          unitId,
          status: "ready",
          data,
        });
      } catch {
        if (controller.signal.aborted) return;

        setResult({
          request,
          unitId,
          status: "error",
          message: "Riwayat belum berhasil dimuat. Coba lagi.",
          expired: false,
        });
      }
    }

    void load();

    return () => controller.abort();
  }, [request, unitId, unitCode]);

  const current =
    result?.request === request && result.unitId === unitId ? result : null;

  const loading = current === null;
  const headingId = `unit-history-heading-${unitId}`;
  const photoEvent = preview?.unitId === unitId ? preview.event : null;
  const contentId = `${headingId}-content`;

  function reload() {
    setRequest((previous) => ({
      page: 1,
      revision: previous.revision + 1,
    }));
  }

  return (
    <>
      <section aria-label="Foto unit" className="mb-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-ws-strong">Foto barang</h3>
          {photoEvent ? <time dateTime={photoEvent.createdAt} className="text-xs tabular-nums">{dateFormat.format(new Date(photoEvent.createdAt))} WIB</time> : null}
        </div>
        {photoEvent?.photos?.length ? (
        <ul className="flex flex-wrap gap-3">
          {photoEvent.photos.map((photo, index) => (
            <UnitHistoryPhoto key={photo.id} url={photo.url} label={`Foto barang ${index + 1}`} size={index === 0 ? "preview" : "thumbnail"} />
          ))}
        </ul>
        ) : loading && request.page === 1 ? <p role="status" className="text-xs leading-5">Memuat foto barang…</p>
          : photoError || current?.status === "error" ? <div><p role="status" className="text-xs leading-5">Foto barang belum berhasil dimuat.</p><button type="button" onClick={reload} className="ws-button-secondary mt-2 text-xs">Muat ulang foto</button></div>
          : <p className="text-xs leading-5">Foto barang belum tersedia.</p>}
      </section>
    {children}
    <section
      aria-labelledby={headingId}
      aria-busy={loading}
      className="mt-6 border-t border-ws-divider pt-5"
    >
      <h3 id={headingId}>
        <button type="button" aria-expanded={historyOpen} aria-controls={contentId} onClick={() => {
          if (!historyOpen && request.page !== 1) setRequest({ page: 1, revision: 0 });
          setHistoryOpen((previous) => !previous);
        }} className="flex min-h-11 w-full items-center gap-3 rounded text-left text-sm font-medium text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">
        <span className="flex-1">Riwayat unit</span>
        {current?.status === "ready" ? (
          <span className="text-xs text-ws-text tabular-nums">
            {current.data.pagination.total} aktivitas
          </span>
        ) : null}
        <span className={historyOpen ? "rotate-90" : ""}><WorkspaceControlIcon name="caretRight" /></span>
        </button>
      </h3>

      {historyOpen ? <div id={contentId}>

      {loading ? (
        <p role="status" className="mt-3 text-sm leading-6">
          Memuat riwayat…
        </p>
      ) : null}

      {current?.status === "error" ? (
        <div className="mt-3">
          <p role="alert" className="text-sm leading-6 text-ws-danger">
            {current.message}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {current.expired ? (
              <a href="/login" className="ws-button-secondary">
                Ke halaman masuk
              </a>
            ) : (
              <button
                type="button"
                onClick={reload}
                className="ws-button-secondary"
              >
                Muat ulang riwayat
              </button>
            )}
          </div>
        </div>
      ) : null}

      {current?.status === "ready" ? (
        <>
          {current.data.events.length === 0 ? (
            <p className="mt-3 text-sm leading-6">
              {current.data.pagination.total === 0
                ? "Belum ada riwayat untuk unit ini."
                : "Tidak ada aktivitas pada halaman ini."}
            </p>
          ) : (
            <ol className="mt-5 ml-1">
              {current.data.events.map((event, eventIndex) => {
                const changes = historyChanges(event);
                const registration = event.action === "STOCK_UNIT_CREATED";
                const details = historyEventDetails(event);
                const borrowingEvent = event.action === "BORROWING_ISSUED" || event.action === "BORROWING_RETURNED";
                const transfer = changes.find((change) => change.key === "custody" && typeof change.before === "string" && typeof change.after === "string");
                const remainingChanges = transfer ? changes.filter((change) => change.key !== "custody") : changes;
                const guest = details.facts.find((fact) => fact.key === "primaryGuestNameSnapshot")?.value;
                const room = details.facts.find((fact) => fact.key === "roomNumberSnapshot")?.value;
                const facts = transfer ? details.facts.filter((fact) => fact.key !== "primaryGuestNameSnapshot" && fact.key !== "roomNumberSnapshot") : details.facts;

                return (
                  <li key={event.id} className="relative border-l border-ws-divider pb-7 pl-6 last:border-l-transparent last:pb-0">
                    <span aria-hidden="true" className={`absolute top-1 -left-[5px] size-2.5 rounded-full border-2 border-ws-surface ${eventIndex === 0 && request.page === 1 ? "bg-ws-sidebar" : "bg-ws-control"}`} />
                    <details open={eventIndex === 0} className="group/activity">
                    <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="text-sm font-medium text-ws-strong">
                        {historyEventTitle(event.action)}
                      </span>

                      <time
                        dateTime={event.createdAt}
                        className="text-xs text-ws-text tabular-nums"
                      >
                        {dateFormat.format(new Date(event.createdAt))} WIB
                      </time>
                    </span>

                    <span className="mt-1 block text-xs leading-5 [overflow-wrap:anywhere]">
                      Petugas · {event.actor.name}
                    </span>
                    </span>
                    <span className="mt-0.5 transition-transform group-open/activity:rotate-90 motion-reduce:transition-none"><WorkspaceControlIcon name="caretRight" /></span>
                    </summary>
                    <div className="pt-1">

                    {event.reason ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                        {event.reason}
                      </p>
                    ) : null}

                    {transfer ? (
                      <div role="group" aria-label="Alur penyerahan unit" className="mt-4 rounded-md border border-ws-divider px-3 py-3">
                        <div aria-hidden="true" className="flex items-center gap-1.5">
                          <span className="size-2.5 shrink-0 rounded-full border-2 border-ws-control bg-ws-surface" />
                          <span className="flex-1 border-t border-dashed border-ws-sidebar/30" />
                          <span className="text-ws-sidebar [&>svg]:size-3"><WorkspaceControlIcon name="caretRight" /></span>
                          <span className="flex-1 border-t border-dashed border-ws-sidebar/30" />
                          <span className="size-2.5 shrink-0 rounded-full bg-ws-sidebar" />
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-5 text-xs leading-5">
                          {[{ label: "Dari", value: transfer.before }, { label: "Ke", value: transfer.after }].map((point, index) => (
                            <div key={point.label} className={`min-w-0 ${index === 1 ? "text-right" : ""}`}>
                              <dt className="text-ws-text">{point.label}</dt>
                              <dd className="font-medium text-ws-strong [overflow-wrap:anywhere]">
                                {point.value}
                                {point.value === "Tamu" && (guest || room) ? <span className="mt-0.5 block font-normal text-ws-text">{guest}{room ? <span className="block">Kamar {room}</span> : null}</span> : null}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}

                    {facts.length > 0 ? (
                      <dl className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
                        {facts.map((fact) => (
                          <div key={fact.key} className="min-w-0">
                            <dt className="text-xs text-ws-text">{fact.label}</dt>
                            <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ws-strong [overflow-wrap:anywhere]">
                              {fact.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {borrowingEvent && event.photos?.length ? (
                      <ul aria-label={details.photoLabel} className="mt-3 flex flex-wrap gap-3">
                        {event.photos.map((photo, index) => (
                          <UnitHistoryPhoto key={photo.id} url={photo.url} label={`${details.photoLabel} ${index + 1}`} />
                        ))}
                      </ul>
                    ) : null}

                    {details.visitHref ? (
                      <Link
                        href={details.visitHref}
                        prefetch={false}
                        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded text-xs font-medium text-ws-strong underline decoration-ws-sidebar/25 underline-offset-4 hover:decoration-ws-sidebar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
                      >
                        Detail pinjaman
                        <span className="[&>svg]:size-4"><WorkspaceControlIcon name="caretRight" /></span>
                      </Link>
                    ) : null}

                    {remainingChanges.length > 0 ? (
                      <section className="mt-3">
                        <h4 className="text-xs font-medium text-ws-strong">
                            {registration
                              ? "Data awal unit"
                              : event.action === "ITEM_UNIT_DETAILS_UPDATED" ? "Rincian pembaruan" : "Perubahan kondisi & kesiapan"}
                        </h4>

                        <dl className="mt-3 space-y-4 pb-2">
                          {remainingChanges.map((change) => (
                            <div key={change.key}>
                              <dt className="text-xs font-medium text-ws-strong">
                                {change.label}
                              </dt>

                              <dd className={`mt-2 text-sm leading-6 ${registration ? "" : "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3"}`}>
                                {!registration ? (
                                  <div>
                                    <p className="text-xs text-ws-text">
                                      Semula
                                    </p>
                                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                      {change.before || "Belum diisi"}
                                    </p>
                                  </div>
                                ) : null}

                                {!registration ? <span aria-hidden="true" className="pt-5 text-ws-control [&>svg]:size-4"><WorkspaceControlIcon name="caretRight" /></span> : null}

                                <div>
                                  {!registration ? (
                                    <p className="text-xs text-ws-text">
                                      Menjadi
                                    </p>
                                  ) : null}
                                  <p className="whitespace-pre-wrap text-ws-strong [overflow-wrap:anywhere]">
                                    {change.after || "Dikosongkan"}
                                  </p>
                                </div>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ) : null}

                    {!borrowingEvent && !registration ? event.photos?.length ? (
                      <ul
                        aria-label={`${details.photoLabel} aktivitas unit`}
                        className="mt-3 flex flex-wrap gap-3"
                      >
                        {event.photos.map((photo, index) => (
                          <UnitHistoryPhoto
                            key={photo.id}
                            url={photo.url}
                            label={`${details.photoLabel} ${index + 1}`}
                          />
                        ))}
                      </ul>
                    ) : details.photoLabel !== "Foto aktivitas" ? (
                      <p className="mt-2 text-xs leading-5">
                        Tidak ada foto yang tercatat pada aktivitas ini.
                      </p>
                    ) : null : null}
                    </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}

          {current.data.pagination.totalPages > 1 ? (
            <nav
              aria-label="Halaman riwayat unit"
              className="mt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-xs tabular-nums">
                Halaman {current.data.pagination.page} dari{" "}
                {current.data.pagination.totalPages}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={request.page <= 1}
                  className="ws-button-secondary"
                  onClick={() =>
                    setRequest({
                      page: request.page - 1,
                      revision: 0,
                    })
                  }
                >
                  Sebelumnya
                </button>

                <button
                  type="button"
                  disabled={
                    !current.data.pagination.hasNextPage ||
                    request.page >= HISTORY_MAX_PAGE
                  }
                  className="ws-button-secondary"
                  onClick={() =>
                    setRequest({
                      page: request.page + 1,
                      revision: 0,
                    })
                  }
                >
                  Berikutnya
                </button>
              </div>
            </nav>
          ) : null}

          {request.page >= HISTORY_MAX_PAGE &&
          current.data.pagination.hasNextPage ? (
            <p className="mt-3 text-xs leading-5">
              Batas halaman riwayat yang tersedia sudah tercapai.
            </p>
          ) : null}
        </>
      ) : null}
      </div> : <div id={contentId} hidden />}
    </section>
    </>
  );
}
