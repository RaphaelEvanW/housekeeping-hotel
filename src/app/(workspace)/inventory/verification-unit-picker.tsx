"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { conditionLabels, readinessLabels } from "@/lib/unit-state-labels";
import { unitDisplayName } from "@/lib/unit-display-name";
import {
  canVerifyUnit,
  parseVerificationUnits,
  type VerificationUnit,
} from "@/lib/unit-verification";

type PageState = {
  after?: number;
  data?: ReturnType<typeof parseVerificationUnits>;
  error?: string;
};

export function VerificationUnitPicker({
  itemId,
  selectedIds,
  disabled,
  onToggle,
}: {
  itemId: string;
  selectedIds: string[];
  disabled: boolean;
  onToggle: (unit: VerificationUnit) => void;
}) {
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<PageState>({});
  const after = cursors[pageIndex];

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (after !== undefined) query.set("after", String(after));
    void fetch(`/api/items/${itemId}/units?${query}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const message = response.status === 401
            ? "Sesi berakhir. Masuk kembali untuk memuat daftar unit."
            : response.status === 403
              ? "Akun ini tidak dapat melihat unit."
              : "Daftar unit belum dapat dimuat.";
          throw new Error(message);
        }
        const body: unknown = await response.json();
        const data = parseVerificationUnits(body, itemId, after);
        if (!data) throw new Error("Respons daftar unit tidak sesuai.");
        return data;
      })
      .then((data) => setPage({ after, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPage({
          after,
          error: error instanceof Error ? error.message : "Daftar unit belum dapat dimuat.",
        });
      });

    return () => controller.abort();
  }, [after, itemId, revision]);

  const current = page.after === after ? page : {};
  const candidates = current.data?.units.filter(canVerifyUnit) ?? [];
  const nextCursor = current.data?.nextCursor ?? null;

  return (
    <section aria-label="Unit yang dapat diverifikasi" className="mt-3">
      {current.error ? (
        <div role="alert" className="rounded-md border border-ws-divider p-3 text-sm">
          <p>{current.error}</p>
          {current.error.startsWith("Sesi berakhir") ? (
            <Link href="/login" className="mt-2 inline-flex min-h-11 items-center text-ws-primary underline underline-offset-4">Masuk kembali</Link>
          ) : null}
          <button type="button" disabled={disabled} onClick={() => setRevision((value) => value + 1)} className="ws-button-secondary mt-2 min-h-11">Coba lagi</button>
        </div>
      ) : !current.data ? (
        <p role="status" className="rounded-md border border-ws-divider px-3 py-4 text-sm">Memuat unit…</p>
      ) : (
        <>
          <ul className="max-h-64 divide-y divide-ws-divider overflow-y-auto overscroll-contain rounded-md border border-ws-divider">
            {candidates.length ? candidates.map((unit) => {
              const checked = selectedIds.includes(unit.id);
              const atLimit = selectedIds.length >= 100 && !checked;
              return (
                <li key={unit.id}>
                  <label className={`flex min-h-14 items-start gap-3 px-3 py-3 ${atLimit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || atLimit}
                      onChange={() => onToggle(unit)}
                      className="mt-1 size-4 shrink-0 accent-ws-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-ws-strong">{unitDisplayName(unit)}</span>
                      <span className="mt-1 block break-words text-xs leading-5 text-ws-muted">
                        {unit.unitCode} · {conditionLabels[unit.condition]} · {readinessLabels[unit.readiness]} · {unit.location?.name ?? "Lokasi belum tersedia"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            }) : (
              <li className="px-3 py-4 text-sm text-ws-muted">Tidak ada unit yang memenuhi syarat di halaman ini.</li>
            )}
          </ul>
          {selectedIds.length >= 100 ? <p className="mt-2 text-xs text-ws-muted">Maksimal 100 unit dalam satu verifikasi.</p> : null}
          {pageIndex > 0 || nextCursor !== null ? (
            <nav aria-label="Halaman unit" className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                aria-label="Halaman unit sebelumnya"
                disabled={disabled || pageIndex === 0}
                onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
                className="ws-button-secondary size-11 rotate-180 p-0"
              ><WorkspaceControlIcon name="caretRight" /><span className="sr-only">Sebelumnya</span></button>
              <span className="text-xs tabular-nums text-ws-muted">Halaman {pageIndex + 1}</span>
              <button
                type="button"
                aria-label="Halaman unit berikutnya"
                disabled={disabled || nextCursor === null}
                onClick={() => {
                  if (nextCursor === null) return;
                  setCursors((currentCursors) => [...currentCursors.slice(0, pageIndex + 1), nextCursor]);
                  setPageIndex((value) => value + 1);
                }}
                className="ws-button-secondary size-11 p-0"
              ><WorkspaceControlIcon name="caretRight" /><span className="sr-only">Berikutnya</span></button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
