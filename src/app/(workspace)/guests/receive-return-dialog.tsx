"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { FieldError } from "@/components/field-error";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { confirmedReturn, prepareReturnUpload, type ReturnPayload, type ReturnUnitChoice } from "@/lib/return-upload";
import { unitDisplayName } from "@/lib/unit-display-name";
import { useInventoryForm } from "@/lib/use-inventory-form";
import { conditionLabels as conditions } from "@/lib/unit-state-labels";
import { UnitPhotoField } from "../inventory/unit-photo-field";
import { OutstandingBorrowingPicker } from "./outstanding-borrowing-picker";

const primaryClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ws-primary bg-ws-primary px-4 text-sm font-medium text-white transition-colors hover:border-ws-primary-hover hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-not-allowed disabled:opacity-60";
const failureSchema = z.object({ error: z.string(), message: z.string().optional() });
type Draft = { line: ReturnUnitChoice; condition: ReturnPayload["lines"][number]["condition"]; locationId: string };
type Attempt = { payload: ReturnPayload; photos: File[][] };

export function ReceiveReturnDialog({ visit, locations }: {
  visit: { id: string; primaryGuestName: string; roomNumber: string };
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const attempt = useRef<Attempt | null>(null);
  const submitting = useRef(false);
  const validation = useInventoryForm();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Draft[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState("");
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(0);
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
    setDefaultLocationId("");
    setOpenUnit(null);
    setUncertain(false);
    setExpired(false);
    setError("");
    setSuccess(0);
    validation.reset();
    setOpen(true);
  }

  function toggle(line: ReturnUnitChoice) {
    if (locked) return;
    const exists = selected.some(value => value.line.id === line.id);
    if (!exists && selected.length >= 100) return;
    setSelected(previous => exists ? previous.filter(value => value.line.id !== line.id) : [...previous, { line, condition: line.unit.condition, locationId: "" }]);
    setOpenUnit(exists ? null : line.id);
    setError("");
    validation.reset();
  }

  function update(id: string, patch: Partial<Pick<Draft, "condition" | "locationId">>) {
    if (locked) return;
    setSelected(previous => previous.map(draft => draft.line.id === id && !(patch.condition === "GOOD" && draft.line.unit.condition !== "GOOD") ? { ...draft, ...patch } : draft));
    setError("");
    validation.reset();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!attempt.current) {
      if (selected.length === 0) { setError("Pilih minimal satu unit yang diterima kembali."); return; }
      if (!validation.validate(event.currentTarget)) {
        const invalid = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>("input[type='file']")).find(field => !field.validity.valid);
        if (invalid) setOpenUnit(invalid.closest<HTMLElement>("details")?.dataset.lineId ?? null);
        return;
      }
      const values = new FormData(event.currentTarget);
      attempt.current = {
        payload: {
          requestId: crypto.randomUUID(), guestVisitId: visit.id, defaultLocationId,
          lines: selected.map(draft => ({ borrowingLineId: draft.line.id, condition: draft.condition, ...(draft.locationId ? { locationId: draft.locationId } : {}) })),
        },
        photos: selected.map((_, index) => values.getAll(`photo-${index}`).filter((file): file is File => file instanceof File && file.size > 0)),
      };
    }
    const current = attempt.current;
    submitting.current = true;
    setPending(true);
    setError("");
    setExpired(false);
    try {
      let upload: Awaited<ReturnType<typeof prepareReturnUpload>>;
      try { upload = await prepareReturnUpload(current.payload, current.photos); }
      catch (failure) {
        if (!uncertain) attempt.current = null;
        setError(failure instanceof Error ? failure.message : "Unggahan belum dapat disiapkan.");
        return;
      }
      const response = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": upload.contentType }, body: upload.body });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200 || response.status === 201) {
        if (!confirmedReturn(body, current.payload)) throw new Error("Unconfirmed return");
        attempt.current = null;
        setUncertain(false);
        setSuccess(current.payload.lines.length);
        setOpen(false);
        router.refresh();
        return;
      }
      const failure = failureSchema.safeParse(body);
      if (!failure.success || response.status >= 500) throw new Error("Unconfirmed return save");
      const code = failure.data.error;
      if (code === "REQUEST_CONFLICT" || code === "RETRY_REQUIRED") {
        setUncertain(true);
        setError(code === "REQUEST_CONFLICT" ? "ID pengembalian sudah digunakan. Hubungi pengelola untuk memeriksa hasil penyimpanan." : "Data sedang berubah. Periksa kembali dengan data dan foto yang sama.");
        return;
      }
      const definitive = ["LINES_UNAVAILABLE", "UNIT_STATE_CONFLICT", "VISIT_NOT_FOUND", "LOCATION_UNAVAILABLE"].includes(code);
      const known = definitive || ["INVALID_INPUT", "INVALID_PHOTO", "INVALID_PHOTOS", "PHOTOS_REQUIRED", "PAYLOAD_TOO_LARGE"].includes(code) || response.status === 401 || response.status === 403;
      if (response.status >= 400 && response.status < 500 && known) {
        if (!uncertain || definitive) { attempt.current = null; setUncertain(false); }
        if (["LINES_UNAVAILABLE", "UNIT_STATE_CONFLICT"].includes(code)) {
          setSelected([]);
          setOpenUnit(null);
          setRevision(value => value + 1);
        }
        if (code === "LOCATION_UNAVAILABLE") {
          setDefaultLocationId("");
          setSelected(previous => previous.map(draft => ({ ...draft, locationId: "" })));
        }
        if (definitive) router.refresh();
        setExpired(response.status === 401);
        setError(response.status === 401 ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan." : response.status === 403 ? "Anda tidak memiliki izin menerima pengembalian." : ["LINES_UNAVAILABLE", "UNIT_STATE_CONFLICT"].includes(code) ? "Status unit sudah berubah. Pilihan disegarkan; pilih kembali unit yang diterima." : failure.data.message ?? "Periksa unit, kondisi, lokasi, dan foto.");
        return;
      }
      throw new Error("Unconfirmed return rejection");
    } catch {
      setUncertain(true);
      setError("Hasil penyimpanan belum dapat dipastikan. Jangan tutup halaman. Periksa penyimpanan lagi dengan data dan foto yang sama.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <div>
    <button type="button" className="ws-button-secondary" onClick={show}>Terima pengembalian</button>
    {success > 0 ? <p role="status" className="mt-2 text-sm text-ws-success">{success} unit berhasil diterima kembali.</p> : null}
    {open ? <dialog ref={dialog} aria-labelledby="receive-return-heading" className="fixed inset-0 m-auto h-[calc(100svh-2rem)] max-h-[860px] w-[calc(100%-2rem)] max-w-[720px] flex-col overflow-clip rounded-lg bg-ws-surface p-0 text-ws-text backdrop:bg-black/40 open:flex" onCancel={event => { event.preventDefault(); if (!locked) setOpen(false); }}>
      <form noValidate onSubmit={submit} onInput={validation.onInput} className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-ws-divider px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-3"><h2 id="receive-return-heading" className="text-sm">Terima pengembalian</h2><button type="button" aria-label="Tutup pengembalian" disabled={locked} onClick={() => setOpen(false)} className="ws-button-secondary size-11 shrink-0 border-transparent bg-transparent p-0"><WorkspaceControlIcon name="close" /></button></div>
          <div className="mt-3 border-t border-ws-divider pt-4"><p className="break-words text-lg font-semibold text-ws-strong">{visit.primaryGuestName}</p><p className="mt-1 text-sm">Kamar {visit.roomNumber}</p></div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-70"><legend className="sr-only">Pilih unit dan catat penerimaannya</legend>
            <div><div className="flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-ws-strong">Pilih unit yang diterima</h3><span className="text-xs">1–100 unit</span></div><p className="mt-1 text-xs leading-5">Bisa memilih unit dari beberapa waktu peminjaman tamu ini.</p><OutstandingBorrowingPicker key={revision} visitId={visit.id} selectedIds={selected.map(draft => draft.line.id)} onToggle={toggle} /></div>
            <div className="border-t border-ws-divider pt-5">
              <label htmlFor="return-default-location" className="block text-sm font-medium text-ws-strong">Lokasi penerimaan <span aria-hidden="true">*</span></label>
              <select id="return-default-location" required value={defaultLocationId} onChange={event => setDefaultLocationId(event.target.value)} aria-invalid={Boolean(validation.errors["return-default-location"])} aria-describedby="return-location-help return-location-error" className="mt-2 min-h-11 w-full rounded-md border border-ws-control bg-ws-surface px-3 text-sm"><option value="">Pilih lokasi penerimaan</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
              <p id="return-location-help" className="mt-2 text-xs leading-5">Berlaku untuk semua unit, kecuali lokasi tiap unit dipilih berbeda.</p><FieldError id="return-location-error" message={validation.errors["return-default-location"]} />
              {locations.length === 0 ? <p role="alert" className="mt-2 text-sm text-ws-danger">Belum ada lokasi penerimaan aktif. Hubungi pengelola lokasi.</p> : null}
            </div>
            <div className="border-t border-ws-divider pt-5"><div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold text-ws-strong">Pemeriksaan unit</h3><span className="text-xs tabular-nums">{selected.length} unit</span></div>
              {selected.length === 0 ? <p className="text-sm">Belum ada unit dipilih.</p> : <div className="space-y-3">{selected.map((draft, index) => <details key={draft.line.id} data-line-id={draft.line.id} open={openUnit === draft.line.id} className="group rounded-lg border border-ws-sidebar/20">
                <summary onClick={event => { event.preventDefault(); if (!locked) setOpenUnit(value => value === draft.line.id ? null : draft.line.id); }} className="flex min-h-11 cursor-pointer list-none items-start gap-3 rounded-lg bg-ws-background px-4 py-3 focus-visible:outline-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden"><span className="text-xs leading-5 tabular-nums">{index + 1}.</span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium text-ws-strong">{unitDisplayName(draft.line.unit)}</span><span className="mt-1 block break-words text-xs">{draft.line.unit.item.name} · {draft.line.unit.unitCode} · {conditions[draft.condition]}</span></span><span className="rotate-90 group-open:-rotate-90"><WorkspaceControlIcon name="caretRight" /></span></summary>
                <div className="space-y-4 border-t border-ws-divider p-4">
                  <p className="text-xs leading-5">Kondisi tercatat: <span className="font-medium text-ws-strong">{conditions[draft.line.unit.condition]}</span>. Pemulihan kondisi dicatat melalui maintenance.</p>
                  <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor={`return-condition-${index}`} className="block text-sm font-medium text-ws-strong">Kondisi diterima <span aria-hidden="true">*</span></label><select id={`return-condition-${index}`} value={draft.condition} onChange={event => update(draft.line.id, { condition: event.target.value as Draft["condition"] })} className="mt-2 min-h-11 w-full rounded-md border border-ws-control bg-ws-surface px-3 text-sm">{Object.entries(conditions).filter(([value]) => draft.line.unit.condition === "GOOD" || value !== "GOOD").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label htmlFor={`return-location-${index}`} className="block text-sm font-medium text-ws-strong">Lokasi unit <span className="font-normal">(opsional)</span></label><select id={`return-location-${index}`} value={draft.locationId} onChange={event => update(draft.line.id, { locationId: event.target.value })} className="mt-2 min-h-11 w-full rounded-md border border-ws-control bg-ws-surface px-3 text-sm"><option value="">Ikuti lokasi penerimaan</option>{locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div></div>
                  {draft.condition !== "GOOD" ? <p className="text-xs leading-5 text-ws-warning">Unit diterima kembali dan perlu pemeriksaan Supervisor.</p> : null}
                  <UnitPhotoField index={index} purpose="return" required={draft.condition !== "GOOD"} error={validation.errors[`return-unit-photo-${index}`]} />
                  <button type="button" className="ws-button-secondary" onClick={() => toggle(draft.line)}>Hapus dari pilihan</button>
                </div>
              </details>)}</div>}
            </div>
          </fieldset>
        </div>
        <footer className="shrink-0 border-t border-ws-divider px-5 py-4 sm:px-7">
          {error ? <p role="alert" className="mb-3 text-sm leading-6 text-ws-danger">{error}</p> : null}
          {expired ? <a href="/login" target={uncertain ? "_blank" : undefined} rel="noopener noreferrer" className="ws-button-secondary mb-3">Masuk kembali{uncertain ? " (tab baru)" : ""}</a> : null}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs tabular-nums">{selected.length} unit akan diterima</p><div className="flex max-w-full flex-wrap justify-end gap-3"><button type="button" disabled={locked} className="ws-button-secondary" onClick={() => setOpen(false)}>Batal</button><button type="submit" disabled={pending || locations.length === 0} className={primaryClass}>{pending ? "Menyimpan…" : uncertain ? "Periksa penyimpanan" : "Simpan pengembalian"}</button></div></div>
        </footer>
      </form>
    </dialog> : null}
  </div>;
}
