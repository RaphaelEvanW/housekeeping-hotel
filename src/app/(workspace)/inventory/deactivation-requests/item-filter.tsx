"use client";

import { useEffect, useState } from "react";
import { WorkspaceFilterDropdown, closeFilterDropdown, filterOptionClass } from "@/components/workspace-filter-dropdown";
import { PaginationChevron } from "@/components/pagination-chevron";
import { ITEM_FILTER_PAGE_SIZE, parseItemFilterOptions, type ItemFilterOptions } from "@/lib/item-filter-options";

type Item = { id: string; name: string };
type Query = { q: string; page: number; revision: number };
type Result = { query: Query } & (
  { data: ItemFilterOptions } | { error: string; expired: boolean }
);

export function ItemFilter({ initialItem }: { initialItem: Item | null }) {
  const [selected, setSelected] = useState(initialItem);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState<Query>({ q: "", page: 1, revision: 0 });
  const [result, setResult] = useState<Result | null>(null);
  const current = result?.query === query ? result : null;

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.q, page: String(query.page), pageSize: String(ITEM_FILTER_PAGE_SIZE) });
        const response = await fetch(`/api/items?${params}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setResult({ query, expired: response.status === 401, error: response.status === 401 ? "Sesi Anda berakhir. Masuk kembali." : response.status === 403 ? "Anda tidak memiliki izin melihat jenis barang." : "Jenis barang belum berhasil dimuat. Coba lagi." });
          return;
        }
        const body: unknown = await response.json();
        const data = parseItemFilterOptions(body, query.page);
        if (!data) throw new Error("Invalid item options");
        if (controller.signal.aborted) return;
        if (query.page > Math.max(1, data.pagination.totalPages)) {
          setQuery(previous => previous === query ? { ...previous, page: 1 } : previous);
          return;
        }
        setResult({ query, data });
      } catch {
        if (!controller.signal.aborted) setResult({ query, expired: false, error: "Jenis barang belum berhasil dimuat. Coba lagi." });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [expanded, query]);

  function choose(item: Item | null) {
    setSelected(item);
  }

  return (
    <>
      {selected ? <input type="hidden" name="itemId" value={selected.id} /> : null}
      <WorkspaceFilterDropdown
        id="item-filter" label="Jenis barang" value={selected?.name ?? "Semua jenis barang"}
        className="flex-1 basis-full sm:min-w-56 sm:basis-56"
        onOpenChange={opened => {
          setExpanded(opened);
          if (opened) setQuery(previous => ({ ...previous, revision: previous.revision + 1 }));
        }}
      >
          <label htmlFor="item-filter-search" className="sr-only">Cari jenis barang untuk filter</label>
          <input
            id="item-filter-search" type="search" value={query.q} maxLength={100} autoComplete="off"
            placeholder="Cari jenis barang…"
            onChange={event => setQuery({ q: event.target.value, page: 1, revision: 0 })}
            onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
            className="min-h-11 w-full min-w-0 rounded-md border border-ws-control bg-ws-inset px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
          />
          <button type="button" onClick={event => { choose(null); closeFilterDropdown(event); }} className="mt-2 flex min-h-11 w-full items-center rounded-md px-2 text-left text-sm font-medium text-ws-primary hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary">Semua jenis barang</button>
          {!current ? <p role="status" className="px-2 py-4 text-xs">Memuat jenis barang…</p> : "error" in current ? (
            <div className="py-3">
              <p role="alert" className="text-xs leading-5 text-ws-danger">{current.error}</p>
              {current.expired ? <a href="/login" className="ws-button-secondary mt-2">Masuk kembali</a> : <button type="button" onClick={() => setQuery(previous => ({ ...previous, revision: previous.revision + 1 }))} className="ws-button-secondary mt-2">Coba lagi</button>}
            </div>
          ) : (
            <>
              <ul aria-label="Pilihan jenis barang" className="max-h-52 overflow-y-auto overscroll-contain border-t border-ws-divider">
                {current.data.items.map(item => (
                  <li key={item.id}>
                    <button
                      type="button" onClick={event => { choose(item); closeFilterDropdown(event); }}
                      className={`${filterOptionClass} ${selected?.id === item.id ? "bg-ws-inset font-medium text-ws-primary" : "text-ws-strong"}`}
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">{item.name}</span>
                      {!item.isActive ? <span className="shrink-0 text-xs text-ws-text">Nonaktif</span> : null}
                      {selected?.id === item.id ? <span className="sr-only">Dipilih</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              {current.data.items.length === 0 ? <p className="px-2 py-4 text-xs leading-5">Jenis barang tidak ditemukan.</p> : null}
              {current.data.pagination.totalPages > 1 ? (
                <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 border-t border-ws-divider pt-3">
                  <button type="button" aria-label="Jenis barang sebelumnya" title="Sebelumnya" disabled={query.page <= 1} onClick={() => setQuery(previous => ({ ...previous, page: previous.page - 1 }))} className="ws-button-secondary size-11 p-0"><PaginationChevron direction="previous" /></button>
                  <span className="text-center text-xs tabular-nums">{query.page} / {current.data.pagination.totalPages}</span>
                  <button type="button" aria-label="Jenis barang berikutnya" title="Berikutnya" disabled={!current.data.pagination.hasNextPage || query.page >= 1000} onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))} className="ws-button-secondary size-11 p-0"><PaginationChevron direction="next" /></button>
                </div>
              ) : null}
              {query.page === 1000 && current.data.pagination.hasNextPage ? <p className="mt-2 text-xs">Persempit pencarian untuk melihat jenis barang lainnya.</p> : null}
            </>
          )}
      </WorkspaceFilterDropdown>
    </>
  );
}
