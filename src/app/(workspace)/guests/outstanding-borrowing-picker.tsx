"use client";

import { useEffect, useState } from "react";
import { PaginationChevron } from "@/components/pagination-chevron";
import { parseOutstandingBorrowings, type ReturnUnitChoice } from "@/lib/return-upload";
import { unitDisplayName } from "@/lib/unit-display-name";

const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function OutstandingBorrowingPicker({ visitId, selectedIds, onToggle }: {
  visitId: string;
  selectedIds: string[];
  onToggle: (line: ReturnUnitChoice) => void;
}) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    page: number; revision: number;
    data?: NonNullable<ReturnType<typeof parseOutstandingBorrowings>>;
    error?: string; expired?: boolean;
  } | null>(null);
  const current = result?.page === page && result.revision === revision ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams({ status: "OUTSTANDING", page: String(page), pageSize: "10" });
        const response = await fetch(`/api/guest-visits/${visitId}/borrowings?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setResult({ page, revision, expired: response.status === 401, error: response.status === 401 ? "Sesi Anda berakhir. Masuk kembali." : "Pinjaman aktif belum dapat dimuat. Coba lagi." });
          return;
        }
        const data = parseOutstandingBorrowings(await response.json(), visitId, page);
        if (!data) throw new Error("Invalid outstanding borrowing page");
        if (!controller.signal.aborted && page > Math.max(1, data.pagination.totalPages)) { setPage(1); return; }
        if (!controller.signal.aborted) setResult({ page, revision, data });
      } catch {
        if (!controller.signal.aborted) setResult({ page, revision, error: "Pinjaman aktif belum dapat dimuat. Coba lagi." });
      }
    }
    void load();
    return () => controller.abort();
  }, [visitId, page, revision]);

  if (!current) return <p role="status" className="py-5 text-sm">Memuat pinjaman aktif…</p>;
  if (!current.data) return <div className="py-4"><p role="alert" className="text-sm text-ws-danger">{current.error}</p>{current.expired ? <a href="/login" target="_blank" rel="noopener noreferrer" className="ws-button-secondary mt-3">Masuk kembali (tab baru)</a> : <button type="button" className="ws-button-secondary mt-3" onClick={() => setRevision(value => value + 1)}>Coba lagi</button>}</div>;
  const { lines, pagination } = current.data;

  return <div className="mt-3">
    {lines.length === 0 ? <p className="py-4 text-sm">Tidak ada pinjaman aktif di halaman ini.</p> : <ul aria-label="Unit yang belum dikembalikan" className="max-h-72 divide-y divide-ws-divider overflow-y-auto overscroll-contain rounded-md border border-ws-divider">
      {lines.map(line => {
        const checked = selectedIds.includes(line.id);
        const eligible = line.unit.custody === "GUEST" && line.unit.lossState === "NONE";
        return <li key={line.id}><label className="flex min-h-11 cursor-pointer items-start gap-3 p-3 hover:bg-ws-inset has-disabled:cursor-not-allowed has-disabled:opacity-50">
          <input type="checkbox" checked={checked} disabled={!checked && (!eligible || selectedIds.length >= 100)} onChange={() => onToggle(line)} className="mt-1 size-4 shrink-0 accent-ws-primary" />
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-ws-strong">{unitDisplayName(line.unit)}</span><span className="mt-1 block break-words text-xs">{line.unit.item.name} · {line.unit.unitCode}</span><span className="mt-1 block text-xs leading-5">Dipinjam {time.format(new Date(line.borrowing.issuedAt))} WIB</span>{!eligible ? <span className="mt-1 block text-xs leading-5 text-ws-warning">{line.unit.lossState !== "NONE" ? "Memerlukan penanganan kehilangan." : "Unit tidak tercatat berada pada tamu."}</span> : null}</span>
          <span className="shrink-0 text-xs text-ws-strong">{checked ? "Dipilih" : eligible ? "Pilih" : "Tidak tersedia"}</span>
        </label></li>;
      })}
    </ul>}
    <nav aria-label="Halaman pinjaman aktif" className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs tabular-nums">{pagination.total} unit belum kembali</span>
      <div className="flex items-center gap-3"><button type="button" aria-label="Pinjaman aktif sebelumnya" disabled={page <= 1} className="ws-button-secondary size-11 p-0" onClick={() => setPage(value => value - 1)}><PaginationChevron direction="previous" /></button><span className="text-xs tabular-nums">{page} / {Math.max(1, pagination.totalPages)}</span><button type="button" aria-label="Pinjaman aktif berikutnya" disabled={!pagination.hasNextPage} className="ws-button-secondary size-11 p-0" onClick={() => setPage(value => value + 1)}><PaginationChevron direction="next" /></button></div>
    </nav>
  </div>;
}
