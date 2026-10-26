"use client";

import { useEffect, useState } from "react";
import { parseBorrowableUnits, type SelectedBorrowingUnit } from "@/lib/borrowable-units";
import { unitDisplayName } from "@/lib/unit-display-name";
import { PaginationChevron } from "@/components/pagination-chevron";

const conditionLabels = { GOOD: "Baik", MINOR_DAMAGE: "Rusak ringan", DAMAGED: "Rusak", MISSING_PART: "Komponen kurang" };

export function BorrowableUnitPicker({ item, selected, onToggle }: {
  item: { id: string; name: string };
  selected: SelectedBorrowingUnit[];
  onToggle: (unit: SelectedBorrowingUnit) => void;
}) {
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0);
  const after = cursors.at(-1);
  const [result, setResult] = useState<{ after?: number; revision: number; data?: NonNullable<ReturnType<typeof parseBorrowableUnits>>; error?: string; expired?: boolean } | null>(null);
  const current = result?.after === after && result?.revision === revision ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ borrowableOnly: "true" });
        if (after !== undefined) params.set("after", String(after));
        const response = await fetch(`/api/items/${item.id}/units?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setResult({ after, revision, expired: response.status === 401, error: response.status === 401 ? "Sesi Anda berakhir. Masuk kembali." : response.status === 403 ? "Anda tidak memiliki izin melihat unit." : "Unit belum dapat dimuat. Coba lagi." });
          return;
        }
        const data = parseBorrowableUnits(await response.json(), item.id, after);
        if (!data) throw new Error("Invalid unit page");
        if (!controller.signal.aborted) setResult({ after, revision, data });
      } catch {
        if (!controller.signal.aborted) setResult({ after, revision, error: "Unit belum dapat dimuat. Coba lagi." });
      }
    }
    void load();
    return () => controller.abort();
  }, [item.id, after, revision]);

  if (!current) return <p role="status" className="py-5 text-sm">Memuat unit yang tersedia…</p>;
  if (!current.data) return <div className="py-4"><p role="alert" className="text-sm text-ws-danger">{current.error}</p>{current.expired ? <a href="/login" className="ws-button-secondary mt-3">Masuk kembali</a> : <button type="button" onClick={() => setRevision(value => value + 1)} className="ws-button-secondary mt-3">Coba lagi</button>}</div>;
  const { data } = current;
  return (
    <div className="mt-4">
      {!data.item.isActive ? <p className="py-4 text-sm text-ws-danger">Jenis barang sudah nonaktif.</p> : data.units.length === 0 ? <p className="py-4 text-sm">Belum ada unit yang tersedia untuk dipinjamkan.</p> : (
        <ul aria-label="Unit yang tersedia" className="max-h-64 divide-y divide-ws-divider overflow-y-auto overscroll-contain rounded-md border border-ws-divider">
          {data.units.map(unit => {
            const checked = selected.some(value => value.id === unit.id);
            return <li key={unit.id}><label className="flex min-h-11 cursor-pointer items-start gap-3 p-3 hover:bg-ws-inset has-disabled:cursor-not-allowed has-disabled:opacity-50">
              <input type="checkbox" checked={checked} disabled={!checked && selected.length >= 100} onChange={() => onToggle({ ...unit, itemName: data.item.name })} className="mt-1 size-4 shrink-0 accent-ws-primary" />
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-ws-strong">{unitDisplayName(unit)}</span><span className="mt-1 block text-xs">{unit.unitCode} · {conditionLabels[unit.condition]} · {unit.location.name}</span></span>
              <span className="shrink-0 text-xs text-ws-primary">{checked ? "Dipilih" : "Pilih"}</span>
            </label></li>;
          })}
        </ul>
      )}
      {cursors.length > 1 || data.nextCursor !== null ? <nav aria-label="Halaman pilihan unit" className="mt-3 flex items-center justify-end gap-3">
        <button type="button" aria-label="Unit sebelumnya" className="ws-button-secondary size-11 p-0" disabled={cursors.length <= 1} onClick={() => setCursors(previous => previous.slice(0, -1))}><PaginationChevron direction="previous" /></button>
        <span className="text-xs tabular-nums">Halaman {cursors.length}</span>
        <button type="button" aria-label="Unit berikutnya" className="ws-button-secondary size-11 p-0" disabled={data.nextCursor === null} onClick={() => { if (data.nextCursor !== null) setCursors(previous => [...previous, data.nextCursor!]); }}><PaginationChevron direction="next" /></button>
      </nav> : null}
    </div>
  );
}
