"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { ItemFilter } from "../inventory/deactivation-requests/item-filter";
import { UnitPhotoField } from "../inventory/unit-photo-field";
import { BorrowableUnitPicker } from "./borrowable-unit-picker";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { unitDisplayName } from "@/lib/unit-display-name";
import type { SelectedBorrowingUnit } from "@/lib/borrowable-units";
import { confirmedBorrowing, prepareBorrowingUpload, type BorrowingPayload } from "@/lib/borrowing-upload";

const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";
const failureSchema = z.object({ error: z.string(), message: z.string().optional() });
type Attempt = { payload: BorrowingPayload; photos: File[][] };

export function IssueBorrowingDialog({ visit }: { visit: { id: string; primaryGuestName: string; roomNumber: string } }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const submitting = useRef(false);
  const validation = useInventoryForm();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedBorrowingUnit[]>([]);
  const [item, setItem] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(0);
  const [revision, setRevision] = useState(0);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const locked = pending || uncertain;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!locked) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [locked]);

  function show() {
    attempt.current = null;
    setSelected([]);
    setItem(null);
    setError("");
    setSuccess(0);
    setExpired(false);
    setUncertain(false);
    validation.reset();
    setOpen(true);
  }

  function toggle(unit: SelectedBorrowingUnit) {
    if (locked) return;
    setSelected(previous => previous.some(value => value.id === unit.id)
      ? previous.filter(value => value.id !== unit.id)
      : previous.length < 100 ? [...previous, unit] : previous);
    setOpenUnit(unit.id);
    setError("");
    validation.reset();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!attempt.current) {
      if (selected.length === 0) { setError("Pilih minimal satu unit untuk dipinjamkan."); return; }
      if (!validation.validate(event.currentTarget)) {
        const invalid = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>("input[type='file']")).find(field => !field.validity.valid);
        setOpenUnit(invalid?.closest<HTMLElement>("details")?.dataset.unitId ?? null);
        return;
      }
      const values = new FormData(event.currentTarget);
      attempt.current = {
        payload: { requestId: crypto.randomUUID(), guestVisitId: visit.id, unitIds: selected.map(unit => unit.id) },
        photos: selected.map((_, index) => values.getAll(`photo-${index}`).filter((file): file is File => file instanceof File)),
      };
    }
    const current = attempt.current;
    submitting.current = true;
    setPending(true);
    setError("");
    setExpired(false);
    try {
      let upload: Awaited<ReturnType<typeof prepareBorrowingUpload>>;
      try {
        upload = await prepareBorrowingUpload(current.payload, current.photos);
      } catch (failure) {
        if (!uncertain) attempt.current = null;
        setError(failure instanceof Error ? failure.message : "Unggahan belum dapat disiapkan.");
        return;
      }
      const response = await fetch("/api/borrowings", { method: "POST", headers: { "Content-Type": upload.contentType }, body: upload.body });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200 || response.status === 201) {
        if (!confirmedBorrowing(body, current.payload)) throw new Error("Unconfirmed borrowing");
        attempt.current = null;
        setUncertain(false);
        setSuccess(current.payload.unitIds.length);
        setOpen(false);
        router.refresh();
        return;
      }
      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) throw new Error("Unconfirmed save");
      const code = failure.data.error;
      if (code === "REQUEST_CONFLICT" || code === "RETRY_REQUIRED") {
        setUncertain(true);
        setError(code === "REQUEST_CONFLICT" ? "ID peminjaman sudah digunakan. Hubungi pengelola untuk memeriksa hasilnya sebelum membuat peminjaman lain." : "Data sedang berubah. Coba periksa kembali dengan data dan foto yang sama.");
        return;
      }
      const knownRejection = ["INVALID_INPUT", "INVALID_PHOTO", "PHOTOS_REQUIRED", "UNITS_UNAVAILABLE", "ITEM_INACTIVE", "VISIT_NOT_FOUND", "VISIT_NOT_STAYING", "LOCATION_UNAVAILABLE", "PAYLOAD_TOO_LARGE"];
      if (response.status >= 400 && response.status < 500 && (knownRejection.includes(code) || response.status === 401 || response.status === 403)) {
        const definitive = ["UNITS_UNAVAILABLE", "ITEM_INACTIVE", "VISIT_NOT_FOUND", "VISIT_NOT_STAYING", "LOCATION_UNAVAILABLE"].includes(code);
        if (!uncertain || definitive) {
          attempt.current = null;
          setUncertain(false);
        }
        setExpired(response.status === 401);
        setRevision(value => value + 1);
        setError(response.status === 401 ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
          : response.status === 403 ? "Anda tidak memiliki izin membuat peminjaman."
            : failure.data.message ?? "Periksa kembali pilihan unit dan foto.");
        return;
      }
      throw new Error("Unconfirmed rejection");
    } catch {
      setUncertain(true);
      setError("Hasil penyimpanan belum dapat dipastikan. Jangan tutup halaman. Periksa penyimpanan lagi dengan data dan foto yang sama.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <>
    <div>
      <button type="button" className={primaryClass} onClick={show}><WorkspaceControlIcon name="plus" />Tambah pinjaman</button>
      {success > 0 ? <p role="status" className="mt-2 text-sm text-ws-success">{success} unit berhasil dipinjamkan.</p> : null}
    </div>
    {open ? <dialog ref={dialog} aria-labelledby="issue-borrowing-heading" className="fixed inset-0 m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-[720px] overflow-hidden rounded-lg bg-ws-surface p-0 text-ws-text backdrop:bg-black/40" onCancel={event => { event.preventDefault(); if (!locked) setOpen(false); }}>
      <form noValidate onSubmit={submit} onInput={validation.onInput} className="flex max-h-[calc(100svh-2rem)] flex-col">
        <header className="shrink-0 border-b border-ws-divider px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <h2 id="issue-borrowing-heading" className="text-sm text-ws-text">Tambah pinjaman</h2>
            <button type="button" aria-label="Tutup tambah pinjaman" disabled={locked} onClick={() => setOpen(false)} className="ws-button-secondary size-11 shrink-0 border-transparent bg-transparent p-0 disabled:opacity-50"><WorkspaceControlIcon name="close" /></button>
          </div>
          <div className="mt-3 border-t border-ws-divider pt-4"><p className="break-words text-lg font-semibold text-ws-strong">{visit.primaryGuestName}</p><p className="mt-1 text-sm">Kamar {visit.roomNumber}</p></div>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-70">
            <legend className="sr-only">Pilih unit dan lengkapi foto</legend>
            <div>
              <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-ws-strong">Pilih barang</h3><p className="text-xs">1–100 unit</p></div>
              <ItemFilter initialItem={null} onSelect={setItem} activeOnly />
              {item ? <BorrowableUnitPicker key={`${item.id}-${revision}`} item={item} selected={selected} onToggle={toggle} /> : <p className="mt-4 text-sm leading-6">Pilih jenis barang untuk melihat unit yang tersedia.</p>}
            </div>
            <div className="border-t border-ws-divider pt-5">
              <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-ws-strong">Unit dipilih</h3><span className="text-xs tabular-nums">{selected.length} unit</span></div>
              {selected.length === 0 ? <p className="text-sm">Belum ada unit dipilih.</p> : <div className="space-y-3">{selected.map((unit, index) => <details key={unit.id} data-unit-id={unit.id} open={openUnit === unit.id} className="group rounded-lg border border-ws-sidebar/20">
                <summary onClick={event => { event.preventDefault(); if (!locked) setOpenUnit(previous => previous === unit.id ? null : unit.id); }} className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-lg bg-ws-background px-4 py-3 focus-visible:outline-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden">
                  <span className="text-xs leading-5 tabular-nums">{index + 1}.</span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-ws-strong">{unitDisplayName(unit)}</span><span className="mt-1 block break-words text-xs">{unit.itemName} · {unit.unitCode}</span></span><span className="rotate-90 group-open:-rotate-90"><WorkspaceControlIcon name="caretRight" /></span>
                </summary>
                <div className="space-y-3 border-t border-ws-divider p-4">
                  <UnitPhotoField index={index} purpose="issue" error={validation.errors[`issue-unit-photo-${index}`]} />
                  <button type="button" className="ws-button-secondary" onClick={() => toggle(unit)}>Hapus dari pilihan</button>
                </div>
              </details>)}</div>}
            </div>
          </fieldset>
        </div>
        <footer className="shrink-0 border-t border-ws-divider px-5 py-4 sm:px-7">
          {error ? <p role="alert" className="mb-3 text-sm leading-6 text-ws-danger">{error}</p> : null}
          {expired ? <a href="/login" target={uncertain ? "_blank" : undefined} rel="noopener noreferrer" className="ws-button-secondary mb-3">Masuk kembali{uncertain ? " (tab baru)" : ""}</a> : null}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs tabular-nums">{selected.length} unit · Foto wajib untuk tiap unit</p><div className="flex gap-3"><button type="button" disabled={locked} onClick={() => setOpen(false)} className="ws-button-secondary">Batal</button><button type="submit" disabled={pending} className={primaryClass}>{pending ? "Menyimpan…" : uncertain ? "Periksa penyimpanan" : "Simpan pinjaman"}</button></div></div>
        </footer>
      </form>
    </dialog> : null}
  </>;
}
