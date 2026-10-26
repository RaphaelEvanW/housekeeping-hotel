"use client";

import { useEffect, useState } from "react";

import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { UnitHistoryPhoto } from "./unit-history-photo";
import {
  HISTORY_MAX_PAGE,
  HISTORY_PAGE_SIZE,
  historyChanges,
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
}: {
  unitId: string;
  unitCode: string;
}) {
  const [request, setRequest] = useState<HistoryRequest>({
    page: 1,
    revision: 0,
  });
  const [result, setResult] = useState<HistoryResult | null>(null);

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

  function reload() {
    setRequest((previous) => ({
      page: 1,
      revision: previous.revision + 1,
    }));
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={loading}
      className="mt-6 border-t border-ws-divider pt-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-sm font-medium text-ws-strong">
          Riwayat unit
        </h3>

        {current?.status === "ready" ? (
          <span className="text-xs text-ws-text tabular-nums">
            {current.data.pagination.total} aktivitas
          </span>
        ) : null}
      </div>

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
            <ol className="mt-3 divide-y divide-ws-divider">
              {current.data.events.map((event) => {
                const changes = historyChanges(event);
                const registration = event.action === "STOCK_UNIT_CREATED";

                return (
                  <li key={event.id} className="py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm font-medium text-ws-strong">
                        {historyEventTitle(event.action)}
                      </p>

                      <time
                        dateTime={event.createdAt}
                        className="text-xs text-ws-text tabular-nums"
                      >
                        {dateFormat.format(new Date(event.createdAt))} WIB
                      </time>
                    </div>

                    <p className="mt-1 text-xs leading-5 [overflow-wrap:anywhere]">
                      Oleh {event.actor.name}
                    </p>

                    {event.reason ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                        {event.reason}
                      </p>
                    ) : null}

                    {changes.length > 0 ? (
                      <details className="group mt-2">
                        <summary className="flex min-h-11 list-none items-center justify-between gap-3 rounded text-sm text-ws-strong hover:text-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden">
                          <span>
                            {registration
                              ? "Lihat detail pencatatan"
                              : "Lihat perubahan"}
                          </span>

                          <span className="transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none">
                            <WorkspaceControlIcon name="caretRight" />
                          </span>
                        </summary>

                        <dl className="space-y-4 pb-2">
                          {changes.map((change) => (
                            <div key={change.key}>
                              <dt className="text-xs font-medium text-ws-strong">
                                {change.label}
                              </dt>

                              <dd className="mt-2 space-y-2 text-sm leading-6">
                                {!registration ? (
                                  <div>
                                    <p className="text-xs text-ws-text">
                                      Sebelum
                                    </p>
                                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                                      {change.before || "—"}
                                    </p>
                                  </div>
                                ) : null}

                                <div>
                                  {!registration ? (
                                    <p className="text-xs text-ws-text">
                                      Sesudah
                                    </p>
                                  ) : null}
                                  <p className="whitespace-pre-wrap text-ws-strong [overflow-wrap:anywhere]">
                                    {change.after || "—"}
                                  </p>
                                </div>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    ) : null}

                    {event.photos?.length ? (
                      <ul aria-label="Foto aktivitas unit" className="mt-3 flex flex-wrap gap-3">
                        {event.photos.map((photo, index) => (
                          <UnitHistoryPhoto key={photo.id} url={photo.url} label={`Foto ${index + 1}`} />
                        ))}
                      </ul>
                    ) : registration ? (
                      <p className="mt-2 text-xs leading-5">Tidak ada foto pada pencatatan awal ini.</p>
                    ) : null}
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
    </section>
  );
}
